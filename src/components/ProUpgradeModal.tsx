import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  openSubscriptionManagement,
  purchasePlan,
  restorePro,
  usePro,
  type StorePlan,
} from '../services/ProService';

const PRIVACY_POLICY_URL = 'https://zoomuc-cell.github.io/HIKER-PRO/privacy_policy.html';
// Apple 표준 이용약관(EULA)
const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export const PRO_FEATURES = [
  {icon: 'chart-bar', title: '상세 통계', desc: '월별·연도별 거리·고도·시간, 개인 최고 기록'},
  {icon: 'map-marker-path', title: 'GPX 경로 내보내기', desc: '다른 등산 앱·지도에서 경로 열기'},
  {icon: 'cloud-upload-outline', title: '기록 백업·복원', desc: '기기를 바꿔도 활동 기록 유지'},
];

const formatDate = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시`;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  // 잠긴 기능을 눌러 열린 경우 그 기능 이름
  featureName?: string | null;
};

const ProUpgradeModal = ({visible, onClose, featureName}: Props) => {
  const pro = usePro();
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

  const buy = async (plan: StorePlan) => {
    const result = await purchasePlan(plan.id);
    if (result.ok) {
      Alert.alert('감사합니다', 'HIKER PRO 기능이 활성화되었습니다.');
      onClose();
    } else if (result.pending) {
      Alert.alert('결제 대기 중', '결제가 완료되면 자동으로 Pro 기능이 활성화됩니다.');
    } else if (!result.cancelled) {
      Alert.alert('결제 실패', result.message || '결제를 진행하지 못했습니다.');
    }
  };

  const restore = async () => {
    const restored = await restorePro();
    Alert.alert(
      '구매 복원',
      restored ? 'Pro 기능이 복원되었습니다.' : `이 ${store} 계정에서 사용 중인 구독을 찾지 못했습니다.`,
    );
  };

  const manage = () => {
    openSubscriptionManagement().catch(() =>
      Alert.alert('구독 관리', `${store} 앱의 구독 메뉴에서 관리할 수 있습니다.`),
    );
  };

  const statusText =
    pro.source === 'subscription'
      ? 'Pro 구독 중'
      : pro.source === 'pass' && pro.passExpiresAt
        ? `관광객 이용권 · ${formatDate(pro.passExpiresAt)}까지`
        : pro.source === 'admin'
          ? 'Pro 활성 (관리자 설정)'
          : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.head}>
              <Icon name="crown" size={28} color="#F9A825" />
              <Text style={styles.title}>HIKER PRO</Text>
            </View>
            {featureName && !pro.isPro ? (
              <Text style={styles.lockText}>'{featureName}'은(는) Pro 기능입니다.</Text>
            ) : null}

            {PRO_FEATURES.map(feature => (
              <View key={feature.title} style={styles.feature}>
                <Icon name={feature.icon} size={22} color="#2E7D32" />
                <View style={styles.featureBody}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDesc}>{feature.desc}</Text>
                </View>
              </View>
            ))}

            {statusText ? (
              <View style={styles.status}>
                <Icon name="check-circle" size={18} color="#2E7D32" />
                <Text style={styles.statusText}>{statusText}</Text>
              </View>
            ) : null}

            {!pro.ready ? (
              <ActivityIndicator style={styles.loading} color="#2E7D32" />
            ) : pro.storeAvailable ? (
              pro.plans.map(plan => (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.plan, pro.busy && styles.disabled]}
                  disabled={pro.busy || (plan.id !== 'pass' && pro.source === 'subscription')}
                  onPress={() => buy(plan)}>
                  <View style={styles.planBody}>
                    <Text style={styles.planTitle}>{plan.title}</Text>
                    <Text style={styles.planSub}>{plan.periodLabel}</Text>
                  </View>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.notice}>
                현재 {store}에서 상품 정보를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.
              </Text>
            )}

            <View style={styles.row}>
              <TouchableOpacity style={styles.linkBtn} onPress={restore} disabled={pro.busy}>
                <Text style={styles.linkText}>구매 복원</Text>
              </TouchableOpacity>
              {pro.source === 'subscription' ? (
                <TouchableOpacity style={styles.linkBtn} onPress={manage}>
                  <Text style={styles.linkText}>구독 관리·해지</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={styles.legal}>
              구독은 {store} 계정으로 결제되며, 현재 기간이 끝나기 최소 24시간 전에 해지하지 않으면 같은
              요금으로 자동 갱신됩니다. 구독 관리·해지는 {store}의 구독 메뉴에서 언제든지 할 수 있습니다.
              관광객 이용권은 구매 시점부터 5일간 사용할 수 있으며 자동으로 갱신되지 않습니다.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}>
                <Text style={styles.legalLink}>개인정보처리방침</Text>
              </TouchableOpacity>
              {Platform.OS === 'ios' ? (
                <TouchableOpacity onPress={() => Linking.openURL(APPLE_EULA_URL).catch(() => {})}>
                  <Text style={styles.legalLink}>이용약관(EULA)</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </ScrollView>

          {pro.busy ? <ActivityIndicator style={styles.busy} color="#2E7D32" /> : null}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  back: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  content: {padding: 20},
  head: {flexDirection: 'row', alignItems: 'center', marginBottom: 8},
  title: {fontSize: 22, fontWeight: '800', color: '#1B5E20', marginLeft: 8},
  lockText: {fontSize: 15, color: '#E65100', fontWeight: '700', marginBottom: 10},
  feature: {flexDirection: 'row', alignItems: 'center', paddingVertical: 8},
  featureBody: {marginLeft: 12, flex: 1},
  featureTitle: {fontSize: 16, fontWeight: '700', color: '#263238'},
  featureDesc: {fontSize: 13, color: '#607D8B', marginTop: 2},
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  statusText: {marginLeft: 6, color: '#2E7D32', fontWeight: '700'},
  loading: {marginVertical: 20},
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2E7D32',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  disabled: {opacity: 0.5},
  planBody: {flex: 1},
  planTitle: {fontSize: 16, fontWeight: '800', color: '#1B5E20'},
  planSub: {fontSize: 12, color: '#607D8B', marginTop: 2},
  planPrice: {fontSize: 17, fontWeight: '800', color: '#263238'},
  notice: {fontSize: 14, color: '#607D8B', marginTop: 14, lineHeight: 20},
  row: {flexDirection: 'row', flexWrap: 'wrap', marginTop: 12},
  linkBtn: {paddingVertical: 6, marginRight: 18},
  linkText: {fontSize: 14, color: '#1565C0', fontWeight: '700'},
  legal: {fontSize: 11, color: '#78909C', lineHeight: 16, marginTop: 14},
  legalLink: {fontSize: 12, color: '#1565C0', marginRight: 16, textDecorationLine: 'underline'},
  busy: {marginBottom: 8},
  closeBtn: {borderTopWidth: 1, borderTopColor: '#ECEFF1', paddingVertical: 14, alignItems: 'center'},
  closeText: {fontSize: 16, color: '#455A64', fontWeight: '700'},
});

export default ProUpgradeModal;
