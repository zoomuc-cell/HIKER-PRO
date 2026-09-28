import React, {useCallback, useEffect, useRef} from 'react';
import {Linking} from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {Provider as PaperProvider} from 'react-native-paper';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import RestaurantListScreen from './src/screens/RestaurantListScreen';
import CouponScreen from './src/screens/CouponScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import HikingPlanScreen from './src/screens/HikingPlanScreen';
import {isPlanImportUrl} from './src/utils/planShare';

// Services

const Tab = createBottomTabNavigator();

// 딥링크(hikerpro://plan/import) 처리용 navigation ref
const navigationRef = createNavigationContainerRef<any>();

const AppTabs = () => {
  const insets = useSafeAreaInsets();

  const bottomInset = Math.max(insets.bottom, 10);
  const tabBarHeight = 82 + bottomInset;

  // 등산계획 공유 링크 → 숨겨진 HikingPlan route 로 전달 (저장은 화면에서 사용자 확인 후)
  const pendingPlanUrlRef = useRef<string | null>(null);

  const openPlanImport = useCallback((url: string | null | undefined) => {
    if (!isPlanImportUrl(url)) {
      return;
    }
    if (navigationRef.isReady()) {
      navigationRef.navigate('HikingPlan', {
        importUrl: url,
        importRequestId: Date.now(),
      });
    } else {
      pendingPlanUrlRef.current = url;
    }
  }, []);

  useEffect(() => {
    let active = true;
    // cold start: 앱이 종료된 상태에서 링크로 실행
    Linking.getInitialURL()
      .then(url => {
        if (active) {
          openPlanImport(url);
        }
      })
      .catch(() => {});
    // running: 실행 중 링크 수신
    const subscription = Linking.addEventListener('url', ({url}) => {
      openPlanImport(url);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [openPlanImport]);

  const onNavigationReady = () => {
    const url = pendingPlanUrlRef.current;
    if (url) {
      pendingPlanUrlRef.current = null;
      openPlanImport(url);
    }
  };

  return (
    <NavigationContainer ref={navigationRef} onReady={onNavigationReady}>
      <Tab.Navigator
        screenOptions={({route}) => ({
          tabBarIcon: ({focused, color}) => {
            let iconName = 'help-circle-outline';

            if (route.name === 'Home') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'Map') {
              iconName = focused ? 'map-marker' : 'map-marker-outline';
            } else if (route.name === 'Track') {
              iconName = 'walk';
            } else if (route.name === 'Restaurants') {
              iconName = 'silverware-fork-knife';
            } else if (route.name === 'Coupons') {
              iconName = focused ? 'ticket' : 'ticket-outline';
            } else if (route.name === 'Profile') {
              iconName = focused ? 'account' : 'account-outline';
            }

            return <Icon name={iconName} size={28} color={color} />;
          },
          tabBarActiveTintColor: '#2E7D32',
          tabBarInactiveTintColor: '#666666',
          tabBarShowIcon: true,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            height: tabBarHeight,
            paddingTop: 6,
            paddingBottom: bottomInset,
          },
          tabBarItemStyle: {
            paddingTop: 2,
            paddingBottom: 2,
          },
          tabBarIconStyle: {
            marginTop: 2,
            marginBottom: 1,
          },
          tabBarLabelStyle: {
            fontSize: 15,
            fontWeight: '700',
            lineHeight: 19,
            marginBottom: 2,
          },
          headerStyle: {
            backgroundColor: '#2E7D32',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
            fontSize: 18,
          },
          headerTitleAlign: 'center',
        })}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            title: 'HIKERPRO',
            tabBarLabel: '홈',
          }}
        />
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{
            title: '지도',
            tabBarLabel: '지도',
          }}
        />
        <Tab.Screen
          name="Track"
          component={TrackingScreen}
          options={{
            title: '활동 기록',
            tabBarLabel: '활동 기록',
          }}
        />
        <Tab.Screen
          name="Restaurants"
          component={RestaurantListScreen}
          options={{
            title: '맛집',
            tabBarLabel: '맛집',
          }}
        />
        <Tab.Screen
          name="Coupons"
          component={CouponScreen}
          options={{
            title: '쿠폰',
            tabBarLabel: '쿠폰',
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: '프로필',
            tabBarLabel: '프로필',
          }}
        />
        {/* 숨겨진 route: 홈 '등산계획'에서만 진입. tabBarButton 이 null 을 반환해 하단 탭 버튼/공간이 생기지 않음 */}
        <Tab.Screen
          name="HikingPlan"
          component={HikingPlanScreen}
          options={{
            title: '등산계획',
            tabBarLabel: '등산계획',
            tabBarButton: () => null,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

const App = () => {
    return (
    <SafeAreaProvider>
      <PaperProvider>
        <AppTabs />
      </PaperProvider>
    </SafeAreaProvider>
  );
};

export default App;


