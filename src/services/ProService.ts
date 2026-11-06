// HIKER PRO 멤버십 (Google Play 결제 / Apple 인앱 결제)
//
// 상품 (Play 콘솔 / App Store Connect 에 같은 ID 로 등록해야 함)
// - 구독 Pro
//   · Android: 구독 상품 `hikerpro_pro` + 기본 요금제 `monthly`(1개월), `yearly`(1년)
//   · iOS: 자동 갱신 구독 `hikerpro_pro_monthly`, `hikerpro_pro_yearly` (같은 구독 그룹)
// - 관광객 이용권 (5일)
//   · Android: 관리되는 인앱 상품 `hikerpro_tourist_pass` (구매 후 소비 처리)
//   · iOS: 비갱신형 구독(Non-Renewing Subscription) `hikerpro_tourist_pass_5d`.
//     (`hikerpro_tourist_pass` 는 App Store Connect 에서 비소모품으로 잘못 만들어 삭제했고,
//      Apple 은 삭제한 제품 ID 를 다시 쓸 수 없어서 iOS 만 ID 가 다르다.) 기간이 정해진 이용권은 Apple 규정상
//     소모성 상품이 아니라 비갱신형 구독으로 등록해야 하고, 다른 기기에서도 복원할 수 있어야 한다.
//
// 서버가 없으므로 결제 확인은 스토어가 기기에 돌려주는 구매 정보를 기준으로 한다.
// 구독은 앱 시작·복원 시 스토어의 활성 구매 목록으로 다시 확인하고,
// 관광객 이용권은 구매 시각 + 5일을 기기에 저장한다.
import {useEffect, useState} from 'react';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ErrorCode,
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Product,
  type ProductSubscription,
  type Purchase,
  type PurchaseError,
  type SubscriptionOffer,
} from 'react-native-iap';

const IS_IOS = Platform.OS === 'ios';

export const ANDROID_SUBSCRIPTION_ID = 'hikerpro_pro';
export const TOURIST_PASS_ID = IS_IOS ? 'hikerpro_tourist_pass_5d' : 'hikerpro_tourist_pass';
export const TOURIST_PASS_DAYS = 5;

export type PlanId = 'monthly' | 'yearly';

const IOS_SUBSCRIPTION_IDS: Record<PlanId, string> = {
  monthly: 'hikerpro_pro_monthly',
  yearly: 'hikerpro_pro_yearly',
};

const SUBSCRIPTION_PRODUCT_IDS = IS_IOS
  ? Object.values(IOS_SUBSCRIPTION_IDS)
  : [ANDROID_SUBSCRIPTION_ID];

const ENTITLEMENT_KEY = 'hiker_entitlement';
// 예전 버전의 숨은 관리자 화면이 쓰던 'Pro 수동 활성화' 값. 결제 없이 유료 기능을 여는 숨은 경로는
// 스토어 규정(App Store 2.3.1, 3.1.1) 위반이라 관리자 화면과 함께 없앴고, 남아 있는 값은 지운다.
// 결제 테스트는 Google Play 라이선스 테스터 / App Store 샌드박스(TestFlight) 계정으로 한다.
const LEGACY_ADMIN_OVERRIDE_KEY = 'hiker_pro';
const PASS_DURATION_MS = TOURIST_PASS_DAYS * 24 * 60 * 60 * 1000;

export type StorePlan = {
  id: PlanId | 'pass';
  title: string;
  price: string; // 스토어가 알려 준 현지 통화 가격 (예: ₩2,900)
  periodLabel: string;
};

export type ProState = {
  ready: boolean; // 스토어 연결·상품 조회 완료
  storeAvailable: boolean; // 판매 가능한 상품이 하나 이상 있음
  isPro: boolean;
  source: 'subscription' | 'pass' | null;
  passExpiresAt: number | null;
  plans: StorePlan[];
  busy: boolean;
};

type Entitlement = {
  subscriptionActive: boolean;
  passExpiresAt: number | null;
};

let state: ProState = {
  ready: false,
  storeAvailable: false,
  isPro: false,
  source: null,
  passExpiresAt: null,
  plans: [],
  busy: false,
};

let entitlement: Entitlement = {subscriptionActive: false, passExpiresAt: null};
let subscriptionProduct: ProductSubscription[] = [];
let initPromise: Promise<void> | null = null;
const listeners = new Set<(next: ProState) => void>();
let pendingResolve: ((result: PurchaseResult) => void) | null = null;

export type PurchaseResult =
  | {ok: true}
  | {ok: false; cancelled?: boolean; pending?: boolean; message?: string};

const emit = () => {
  const now = Date.now();
  const passActive = !!entitlement.passExpiresAt && entitlement.passExpiresAt > now;
  const source: ProState['source'] = entitlement.subscriptionActive
    ? 'subscription'
    : passActive
      ? 'pass'
      : null;
  state = {
    ...state,
    isPro: source !== null,
    source,
    passExpiresAt: passActive ? entitlement.passExpiresAt : null,
  };
  listeners.forEach(listener => listener(state));
};

const setState = (patch: Partial<ProState>) => {
  state = {...state, ...patch};
  emit();
};

const saveEntitlement = async () => {
  try {
    await AsyncStorage.setItem(ENTITLEMENT_KEY, JSON.stringify(entitlement));
  } catch (e) {}
};

const loadCachedEntitlement = async () => {
  try {
    const raw = await AsyncStorage.getItem(ENTITLEMENT_KEY);
    AsyncStorage.removeItem(LEGACY_ADMIN_OVERRIDE_KEY).catch(() => {});
    if (raw) {
      const parsed = JSON.parse(raw);
      entitlement = {
        subscriptionActive: !!parsed?.subscriptionActive,
        passExpiresAt: typeof parsed?.passExpiresAt === 'number' ? parsed.passExpiresAt : null,
      };
    }
  } catch (e) {}
  emit();
};

const isSubscriptionPurchase = (purchase: Purchase) =>
  SUBSCRIPTION_PRODUCT_IDS.indexOf(purchase.productId) >= 0;

const planOfferAndroid = (planId: PlanId): SubscriptionOffer | null => {
  const product = subscriptionProduct.find(p => p.id === ANDROID_SUBSCRIPTION_ID);
  const offers = (product?.subscriptionOffers || []).filter(
    offer => offer.basePlanIdAndroid === planId && !!offer.offerTokenAndroid,
  );
  if (offers.length === 0) {
    return null;
  }
  // 기본 요금제 자체(가격 단계가 1개)를 우선 사용하고, 없으면 첫 번째 제안 사용
  const phases = (offer: SubscriptionOffer) =>
    offer.pricingPhasesAndroid?.pricingPhaseList?.length ?? 99;
  return [...offers].sort((a, b) => phases(a) - phases(b))[0];
};

const buildPlans = (subs: ProductSubscription[], passes: Product[]): StorePlan[] => {
  const plans: StorePlan[] = [];
  const labels: Record<PlanId, {title: string; period: string}> = {
    monthly: {title: '월간 Pro', period: '1개월마다 자동 갱신'},
    yearly: {title: '연간 Pro', period: '1년마다 자동 갱신'},
  };
  (['monthly', 'yearly'] as PlanId[]).forEach(planId => {
    let price: string | null = null;
    if (IS_IOS) {
      price = subs.find(p => p.id === IOS_SUBSCRIPTION_IDS[planId])?.displayPrice || null;
    } else {
      price = planOfferAndroid(planId)?.displayPrice || null;
    }
    if (price) {
      plans.push({id: planId, title: labels[planId].title, price, periodLabel: labels[planId].period});
    }
  });
  const pass = passes.find(p => p.id === TOURIST_PASS_ID);
  if (pass) {
    plans.push({
      id: 'pass',
      title: '관광객 이용권',
      price: pass.displayPrice,
      periodLabel: `${TOURIST_PASS_DAYS}일 이용 (자동 갱신 없음)`,
    });
  }
  return plans;
};

// 스토어의 현재 구매 목록으로 구독 상태를 다시 확인
export const refreshEntitlement = async () => {
  try {
    const purchases = await getAvailablePurchases();
    const active = purchases.some(
      purchase => isSubscriptionPurchase(purchase) && purchase.purchaseState === 'purchased',
    );
    let passExpiresAt = entitlement.passExpiresAt;
    if (IS_IOS) {
      // iOS 비갱신형 구독: 스토어의 구매 시각 + 5일 (재설치·기기 변경 후 '구매 복원'으로 되살아남)
      purchases.forEach(purchase => {
        if (purchase.productId === TOURIST_PASS_ID && purchase.purchaseState === 'purchased') {
          const expires = passExpiryFromStore(purchase);
          if (expires && (!passExpiresAt || expires > passExpiresAt)) {
            passExpiresAt = expires;
          }
        }
      });
    }
    entitlement = {...entitlement, subscriptionActive: active, passExpiresAt};
    await saveEntitlement();
    emit();
    // 완료 처리가 안 된 구매가 남아 있으면 마무리 (Android 는 3일 안에 하지 않으면 자동 환불)
    for (const purchase of purchases) {
      const unfinished = IS_IOS
        ? false
        : purchase.productId === TOURIST_PASS_ID || (purchase as any).isAcknowledgedAndroid === false;
      if (purchase.purchaseState === 'purchased' && unfinished) {
        await handlePurchase(purchase, false);
      }
    }
  } catch (e) {
    console.warn('[Pro] refreshEntitlement failed:', e);
  }
};

const passExpiryFromStore = (purchase: Purchase): number | null => {
  const bought = Number(purchase.transactionDate);
  return Number.isFinite(bought) && bought > 0 ? bought + PASS_DURATION_MS : null;
};

const handlePurchase = async (purchase: Purchase, fromNewPurchase: boolean) => {
  if (purchase.purchaseState === 'pending') {
    // 편의점 결제 등 결제 대기 상태: 결제 완료 후 다시 전달됨
    pendingResolve?.({ok: false, pending: true});
    pendingResolve = null;
    return;
  }
  if (purchase.purchaseState !== 'purchased') {
    return;
  }
  try {
    if (purchase.productId === TOURIST_PASS_ID) {
      if (fromNewPurchase || !entitlement.passExpiresAt) {
        // 남은 기간이 있으면 그 뒤에 이어 붙인다
        const bought = Number(purchase.transactionDate) || Date.now();
        const base = Math.max(bought, entitlement.passExpiresAt || 0);
        entitlement = {...entitlement, passExpiresAt: base + PASS_DURATION_MS};
        await saveEntitlement();
      }
      // Android 는 다시 살 수 있도록 소비 처리, iOS 비갱신형 구독은 소비하지 않음
      await finishTransaction({purchase, isConsumable: !IS_IOS});
    } else if (isSubscriptionPurchase(purchase)) {
      entitlement = {...entitlement, subscriptionActive: true};
      await saveEntitlement();
      await finishTransaction({purchase, isConsumable: false});
    }
    emit();
    if (fromNewPurchase) {
      pendingResolve?.({ok: true});
      pendingResolve = null;
    }
  } catch (e) {
    console.warn('[Pro] finishTransaction failed:', e);
    if (fromNewPurchase) {
      pendingResolve?.({ok: false, message: '구매를 완료하지 못했습니다. 잠시 후 "구매 복원"을 눌러 주세요.'});
      pendingResolve = null;
    }
  }
};

const handlePurchaseError = (error: PurchaseError) => {
  if (!pendingResolve) {
    return;
  }
  if (error.code === ErrorCode.UserCancelled) {
    pendingResolve({ok: false, cancelled: true});
  } else {
    pendingResolve({ok: false, message: error.message || '결제를 진행하지 못했습니다.'});
  }
  pendingResolve = null;
};

let listenersAttached = false;
let cacheLoaded = false;

// 스토어 연결·상품 조회. 실패하면(인터넷이 약한 산 입구 등) 다음 호출 때 다시 시도한다.
export const initPro = () => {
  if (initPromise) {
    return initPromise;
  }
  const attempt = (async () => {
    if (!cacheLoaded) {
      cacheLoaded = true;
      await loadCachedEntitlement();
    }
    try {
      const connected = await initConnection();
      if (!connected) {
        setState({ready: true});
        initPromise = null;
        return;
      }
      if (!listenersAttached) {
        listenersAttached = true;
        purchaseUpdatedListener(purchase => {
          handlePurchase(purchase, true);
        });
        purchaseErrorListener(handlePurchaseError);
      }

      const [subs, passes] = await Promise.all([
        fetchProducts({skus: SUBSCRIPTION_PRODUCT_IDS, type: 'subs'}).catch(() => null),
        fetchProducts({skus: [TOURIST_PASS_ID], type: 'in-app'}).catch(() => null),
      ]);
      subscriptionProduct = ((subs || []) as ProductSubscription[]).filter(p => p.type === 'subs');
      const passProducts = ((passes || []) as Product[]).filter(p => p.type === 'in-app');
      const plans = buildPlans(subscriptionProduct, passProducts);
      setState({ready: true, storeAvailable: plans.length > 0, plans});
      if (plans.length === 0) {
        initPromise = null;
      }
      await refreshEntitlement();
    } catch (e) {
      console.warn('[Pro] store init failed:', e);
      setState({ready: true});
      initPromise = null;
    }
  })();
  initPromise = attempt;
  return attempt;
};

// '다시 시도' 버튼: 상품 정보를 다시 불러온다
export const retryStore = async () => {
  if (state.storeAvailable) {
    return true;
  }
  setState({ready: false});
  initPromise = null;
  await initPro();
  return state.storeAvailable;
};

export const purchasePlan = async (planId: StorePlan['id']): Promise<PurchaseResult> => {
  await initPro();
  if (state.busy) {
    return {ok: false, message: '이전 결제가 진행 중입니다.'};
  }
  setState({busy: true});
  try {
    const result = new Promise<PurchaseResult>(resolve => {
      pendingResolve = resolve;
    });
    if (planId === 'pass') {
      await requestPurchase({
        type: 'in-app',
        request: {
          apple: {sku: TOURIST_PASS_ID},
          google: {skus: [TOURIST_PASS_ID]},
        },
      });
    } else if (IS_IOS) {
      await requestPurchase({
        type: 'subs',
        request: {apple: {sku: IOS_SUBSCRIPTION_IDS[planId]}},
      });
    } else {
      const offer = planOfferAndroid(planId);
      if (!offer?.offerTokenAndroid) {
        pendingResolve = null;
        return {ok: false, message: '요금제 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'};
      }
      await requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [ANDROID_SUBSCRIPTION_ID],
            subscriptionOffers: [{sku: ANDROID_SUBSCRIPTION_ID, offerToken: offer.offerTokenAndroid}],
          },
        },
      });
    }
    return await result;
  } catch (e: any) {
    pendingResolve = null;
    if (e?.code === ErrorCode.UserCancelled) {
      return {ok: false, cancelled: true};
    }
    return {ok: false, message: e?.message || '결제를 진행하지 못했습니다.'};
  } finally {
    setState({busy: false});
  }
};

export const restorePro = async () => {
  await initPro();
  setState({busy: true});
  try {
    await refreshEntitlement();
  } finally {
    setState({busy: false});
  }
  return state.isPro;
};

export const openSubscriptionManagement = async () => {
  await deepLinkToSubscriptions(
    IS_IOS ? undefined : {skuAndroid: ANDROID_SUBSCRIPTION_ID, packageNameAndroid: 'com.hikerpro.app'},
  );
};

export const getProState = () => state;

export const usePro = () => {
  const [current, setCurrent] = useState<ProState>(state);
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(state);
    initPro();
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
};
