import React, {useEffect, useState, useRef} from 'react';
import {View, StyleSheet, Text, TouchableOpacity, Alert, Platform} from 'react-native';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LocationService from '../services/LocationService';
type Coordinate = {
  latitude: number;
  longitude: number;
};



const MapScreen = ({route}: {route?: any}) => {
  const mapRef = useRef<MapView | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [altitude, setAltitude] = useState(0);
  const [trail, setTrail] = useState<Coordinate[]>([]);
  const [accuracy, setAccuracy] = useState(999);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const locationSubscription = LocationService.watchPosition(location => {
      const nextLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      setCurrentLocation(nextLocation);
      setAltitude(location.altitude || 0);
      setAccuracy(location.accuracy || 999);
      // 지도를 오래 켜 두어도 메모리가 계속 늘지 않도록 최근 2000개 지점만 표시
      setTrail(prev => [...prev.slice(-1999), nextLocation]);
    });

    return () => {
      locationSubscription.remove();
    };
  }, []);

  const centerOnUser = async () => {
    if (currentLocation) {
      mapRef.current?.animateToRegion({
        ...currentLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      return;
    }

    if (locating) {
      return;
    }

    // 아직 watchPosition 첫 수신 전: 1회 위치 요청
    setLocating(true);
    try {
      const pos = (await LocationService.getCurrentPosition()) as {
        latitude: number;
        longitude: number;
      } | null;
      if (!pos || typeof pos.latitude !== 'number' || typeof pos.longitude !== 'number') {
        throw new Error('invalid position');
      }
      const coord = {latitude: pos.latitude, longitude: pos.longitude};
      setCurrentLocation(prev => prev ?? coord);
      mapRef.current?.animateToRegion({
        ...coord,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    } catch (e) {
      Alert.alert(
        '위치 확인 실패',
        '현재 위치를 가져오지 못했습니다. 위치 권한과 GPS가 켜져 있는지 확인한 뒤 다시 시도해 주세요.',
      );
    } finally {
      setLocating(false);
    }
  };

  // 홈 '현위치 보기'에서 navigate('Map', {centerRequestId}) 로 진입 시 기존 centerOnUser 재사용
  const centerRequestId = route?.params?.centerRequestId;
  useEffect(() => {
    if (!centerRequestId) {
      return;
    }
    // 탭 최초 진입 시 MapView 레이아웃 이후 이동하도록 약간 지연
    const timer = setTimeout(() => {
      centerOnUser();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerRequestId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={{
          latitude: 37.4449,
          longitude: 127.1388,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}>
        
        {/* ?깆궛 寃쎈줈 */}
        {trail.length > 1 && (
          <Polyline
            coordinates={trail}
            strokeColor="#2E7D32"
            strokeWidth={4}
          />
        )}

      </MapView>

      {/* 怨좊룄 & GNSS ?뺣낫 */}
      <View style={styles.altitudeCard}>
        <Icon name="elevation-rise" size={24} color="#2E7D32" />
        <View style={styles.altitudeInfo}>
          <Text style={styles.altitudeText}>{altitude.toFixed(1)}m</Text>
        </View>
        {/* 위성 개수·GNSS 종류는 기기에서 실제로 알 수 없어 표시하지 않고, 위치 정확도만 보여 준다 */}
        {accuracy < 999 && (
          <View style={styles.accuracyBadge}>
            <Icon
              name={accuracy <= 20 ? 'check-circle' : 'alert-circle-outline'}
              size={16}
              color={accuracy <= 20 ? '#4CAF50' : '#F57C00'}
            />
            <Text style={styles.accuracyText}>위치 정확도 ±{accuracy.toFixed(0)}m</Text>
          </View>
        )}
      </View>

      {/* 以묒떖 踰꾪듉 */}
      <TouchableOpacity style={[styles.centerButton, styles.centerButtonLabeled]} onPress={centerOnUser}>
        <View style={styles.centerButtonDot} />
        <Text style={styles.centerButtonText}>{locating ? '확인중' : '현위치'}</Text>
      </TouchableOpacity>

      {/* 위치 확인 중 안내 */}
      {locating && (
        <View style={styles.locatingBanner}>
          <Text style={styles.locatingText}>현재 위치 확인 중...</Text>
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  altitudeCard: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  altitudeInfo: {
    marginLeft: 8,
    flexDirection: 'column',
  },
  altitudeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  gnssRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  gnssText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  centerButtonLabeled: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerButtonDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2E7D32',
    marginBottom: 3,
  },
  locatingBanner: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 110,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  locatingText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  centerButtonText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginTop: 1,
  },
  accuracyBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  accuracyText: {
    marginLeft: 4,
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  gnssCard: {
    position: 'absolute',
    top: 140,
    left: 20,
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  gnssStatusText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  centerButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    backgroundColor: 'white',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  restaurantBadge: {
    position: 'absolute',
    top: 80,
    left: 20,
    backgroundColor: '#FF5722',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 6,
  },
});

export default MapScreen;


