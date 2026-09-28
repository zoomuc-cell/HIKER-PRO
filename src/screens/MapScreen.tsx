import React, {useEffect, useState, useRef} from 'react';
import {View, StyleSheet, Text, TouchableOpacity, Alert} from 'react-native';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LocationService from '../services/LocationService';
import {restaurants} from '../assets/data/restaurants';
type Coordinate = {
  latitude: number;
  longitude: number;
};

type GNSSStatus = {
  activeGNSS: string[];
  accuracy: number;
  accuracyLevel: string;
  satelliteCount: number;
  usingSensorFusion: boolean;
};


const MapScreen = ({navigation, route}: {navigation: any; route?: any}) => {
  const mapRef = useRef<MapView | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [altitude, setAltitude] = useState(0);
  const [trail, setTrail] = useState<Coordinate[]>([]);
  const [nearbyRestaurants, setNearbyRestaurants] = useState<typeof restaurants>([]);
  const [gnssStatus, setGnssStatus] = useState<GNSSStatus | null>(null);
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
      setGnssStatus(LocationService.getGNSSStatus());
      setTrail(prev => [...prev, nextLocation]);
    });

    return () => {
      locationSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (currentLocation) {
      setNearbyRestaurants(findNearbyRestaurants(currentLocation));
    }
  }, [currentLocation]);

  const findNearbyRestaurants = (location: Coordinate) => {
    return restaurants.filter(restaurant => {
      const distance = getDistance(
        location.latitude,
        location.longitude,
        restaurant.latitude,
        restaurant.longitude
      );
      return distance < 5; // 5km ?대궡
    });
  };

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // 吏援?諛섍꼍 (km)
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) *
        Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const deg2rad = (deg: number): number => {
    return deg * (Math.PI / 180);
  };

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
        provider={PROVIDER_GOOGLE}
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

        {/* 二쇰? 留쏆쭛 留덉빱 */}
        {nearbyRestaurants.map((restaurant, index) => (
          <Marker
            key={index}
            coordinate={{
              latitude: restaurant.latitude,
              longitude: restaurant.longitude,
            }}
            title={restaurant.name}
            description={`${restaurant.cuisine} · ${restaurant.distance || 'N/A'}`}
            onCalloutPress={() => {
              navigation.navigate('Restaurants', {
                restaurant: restaurant,
              });
            }}>
            <Icon name="silverware-fork-knife" size={30} color="#FF5722" />
          </Marker>
        ))}
      </MapView>

      {/* 怨좊룄 & GNSS ?뺣낫 */}
      <View style={styles.altitudeCard}>
        <Icon name="elevation-rise" size={24} color="#2E7D32" />
        <View style={styles.altitudeInfo}>
          <Text style={styles.altitudeText}>{altitude.toFixed(1)}m</Text>
          {accuracy < 20 && (
            <View style={styles.gnssRow}>
              <Icon name="satellite-variant" size={14} color="#4CAF50" />
              <Text style={styles.gnssText}>{gnssStatus?.satelliteCount || 0}개</Text>
            </View>
          )}
        </View>
        {accuracy < 10 && (
          <View style={styles.accuracyBadge}>
            <Icon name="check-circle" size={16} color="#4CAF50" />
            <Text style={styles.accuracyText}>±{accuracy.toFixed(0)}m</Text>
          </View>
        )}
      </View>

      {/* Multi-GNSS ?곹깭 ?쒖떆 */}
      {gnssStatus?.activeGNSS && gnssStatus.activeGNSS.length > 0 && (
        <View style={styles.gnssCard}>
          <Icon name="satellite-uplink" size={20} color="#2196F3" />
          <Text style={styles.gnssStatusText}>
            {gnssStatus.activeGNSS.join(' + ')}
          </Text>
        </View>
      )}

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

      {/* 二쇰? 留쏆쭛 媛쒖닔 */}
      {nearbyRestaurants.length > 0 && (
        <View style={styles.restaurantBadge}>
          <Icon name="silverware-fork-knife" size={20} color="#fff" />
          <Text style={styles.badgeText}>{nearbyRestaurants.length}개 맛집</Text>
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


