import Geolocation from 'react-native-geolocation-service';
import {AppState, PermissionsAndroid, Platform} from 'react-native';
import {accelerometer, barometer} from 'react-native-sensors';
import {requestIosLocationPermission} from '../utils/permissions';

type WatchCallback = (location: any) => void;

// iOS 에서 활동 기록 중이 아닐 때 앱이 백그라운드로 가면 멈췄다가, 다시 활성화되면 재개하는 watch
type IosWatch = {
  callback: WatchCallback;
  nativeId: number | null;
};

class LocationService {
  private watchIds = new Set<number>();
  private trackingActive = false;
  private iosWatches = new Set<IosWatch>();
  currentLocation: any = null;
  // (GPS 고도 - 기압 고도) 차이. null 이면 아직 보정 전
  private baroOffset: number | null = null;
  barometerSubscription: any = null;
  accelerometerSubscription: any = null;

  // 센서 데이터
  sensorData: {
    pressure: number | null;
    acceleration: number | null;
    previousAltitude: number | null;
    altitudeHistory: number[];
  } = {
    pressure: null,        // 기압 (hPa)
    acceleration: null,    // 가속도
    previousAltitude: null,
    altitudeHistory: [] as number[],
  };

  // GNSS 정확도 기준 (미터)
  accuracyThresholds = {
    excellent: 5,    // ±5m 이하
    good: 10,        // ±10m 이하
    moderate: 20,    // ±20m 이하
    poor: 50,        // ±50m 이하
  };

  constructor() {
    if (Platform.OS === 'ios') {
      // iOS 는 Info.plist 의 UIBackgroundModes(location) 때문에 모든 watch 가 백그라운드에서도 계속된다.
      // 사용자가 시작한 활동 기록 중에만 백그라운드 위치를 사용하도록, 기록 중이 아니면 백그라운드 진입 시 멈춘다.
      AppState.addEventListener('change', state => {
        if (state === 'background' && !this.trackingActive) {
          this.pauseIosWatches();
        } else if (state === 'active') {
          this.resumeIosWatches();
        }
      });
    }
  }

  async requestPermission() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Hiker Pro 위치 권한',
          message: 'Hiker Pro가 멀티 GNSS (GPS/GLONASS/BeiDou/Galileo)를 이용한 정밀 위치 추적을 위해 권한이 필요합니다.',
          buttonPositive: '허용',
          buttonNegative: '거부',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    if (Platform.OS === 'ios') {
      return requestIosLocationPermission(false);
    }
    return true;
  }

  /**
   * 기압계 기반 고도 계산
   * 표준 대기압 공식: h = 44330 * (1 - (P/P0)^0.1903)
   */
  calculateAltitudeFromPressure(pressure: number): number {
    const P0 = 1013.25; // 해수면 표준 기압 (hPa)
    const altitude = 44330 * (1 - Math.pow(pressure / P0, 0.1903));
    return altitude;
  }

  /**
   * 1차 저역 필터. 예전 값(Q=0.01, R=2 → 계수 0.005)은 새 값을 0.5%만 반영해서
   * 실제로 500m 를 올라도 고도가 거의 변하지 않았다. 지금은 새 값을 30% 반영한다.
   */
  kalmanFilter(measurement: number, previousEstimate: number | null): number {
    if (previousEstimate === null || !Number.isFinite(previousEstimate)) {
      return measurement;
    }
    const K = 0.3;
    return previousEstimate + K * (measurement - previousEstimate);
  }

  /**
   * 센서 융합: GPS 고도 + 기압계
   * 기압계 절대 고도는 날씨에 따라 수십~수백 m 틀리지만 고도 '변화'는 정확하다.
   * 그래서 GPS 정확도가 좋을 때 (GPS 고도 - 기압 고도) 차이를 천천히 맞춰 두고,
   * 고도는 '기압 고도 + 그 차이'로 계산한다. 기압계가 없으면 GPS 고도를 걸러서 쓴다.
   */
  fuseSensorData(gpsAltitude: number, accuracy: number): number {
    let fusedAltitude = gpsAltitude;
    const hasGpsAltitude = Number.isFinite(gpsAltitude) && gpsAltitude !== 0;

    if (this.sensorData.pressure) {
      const baroAltitude = this.calculateAltitudeFromPressure(this.sensorData.pressure);
      if (hasGpsAltitude && accuracy <= 20) {
        const diff = gpsAltitude - baroAltitude;
        this.baroOffset = this.baroOffset === null ? diff : this.baroOffset + 0.05 * (diff - this.baroOffset);
      }
      fusedAltitude = this.baroOffset === null ? gpsAltitude : baroAltitude + this.baroOffset;
    } else {
      fusedAltitude = this.kalmanFilter(gpsAltitude, this.sensorData.previousAltitude);
    }

    // 이동 평균 (최근 5개 데이터)
    this.sensorData.altitudeHistory.push(fusedAltitude);
    if (this.sensorData.altitudeHistory.length > 5) {
      this.sensorData.altitudeHistory.shift();
    }

    const smoothedAltitude =
      this.sensorData.altitudeHistory.reduce((a, b) => a + b, 0) /
      this.sensorData.altitudeHistory.length;

    this.sensorData.previousAltitude = smoothedAltitude;
    return smoothedAltitude;
  }

  // 새 활동을 시작할 때 이전 활동(또는 지도 화면)의 고도 보정 상태를 지운다
  resetAltitudeState() {
    this.sensorData.previousAltitude = null;
    this.sensorData.altitudeHistory = [];
    this.baroOffset = null;
  }

  /**
   * 기압계 센서 시작
   */
  startBarometer() {
    if (this.barometerSubscription) return;

    this.barometerSubscription = barometer.subscribe(
      ({pressure}) => {
        this.sensorData.pressure = pressure;
      },
      (error) => {
        console.warn('Barometer error:', error);
      }
    );
  }

  /**
   * 가속도계 센서 시작 (움직임 감지)
   */
  startAccelerometer() {
    if (this.accelerometerSubscription) return;

    this.accelerometerSubscription = accelerometer.subscribe(
      ({x, y, z}) => {
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        this.sensorData.acceleration = magnitude;
      },
      (error) => {
        console.warn('Accelerometer error:', error);
      }
    );
  }

  /**
   * GNSS 정확도 평가
   */
  getAccuracyLevel(accuracy: number): string {
    if (!accuracy) return 'unknown';
    if (accuracy <= this.accuracyThresholds.excellent) return 'excellent';
    if (accuracy <= this.accuracyThresholds.good) return 'good';
    if (accuracy <= this.accuracyThresholds.moderate) return 'moderate';
    if (accuracy <= this.accuracyThresholds.poor) return 'poor';
    return 'very_poor';
  }

  /**
   * 사용 중인 GNSS 시스템 추정
   * (Android 는 GnssStatus 로 확인할 수 있지만, 여기서는 정확도로 추정)
   */
  getActiveGNSS(position: any): string[] {
    const gnssTypes = [];

    if (position.coords.accuracy <= 3) {
      // 최고 정확도: 5개 시스템 모두 활성
      gnssTypes.push('GPS', 'GLONASS', 'Galileo', 'BeiDou', 'QZSS');
    } else if (position.coords.accuracy <= 5) {
      // 우수: 4개 시스템
      gnssTypes.push('GPS', 'GLONASS', 'Galileo', 'BeiDou');
    } else if (position.coords.accuracy <= 10) {
      // 양호: 2-3개 시스템
      gnssTypes.push('GPS', 'GLONASS', 'QZSS');
    } else {
      // 기본: GPS만
      gnssTypes.push('GPS');
    }

    return gnssTypes;
  }

  async getCurrentPosition() {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      throw new Error('Location permission denied');
    }

    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          const gpsAltitude = position.coords.altitude || 0;
          const accuracy = position.coords.accuracy || 999;

          // 센서 융합으로 정밀 고도 계산
          const fusedAltitude = this.fuseSensorData(gpsAltitude, accuracy);

          this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: fusedAltitude,
            gpsAltitude: gpsAltitude,
            accuracy: accuracy,
            accuracyLevel: this.getAccuracyLevel(accuracy),
            activeGNSS: this.getActiveGNSS(position),
            speed: position.coords.speed,
            heading: position.coords.heading,
            timestamp: position.timestamp,
            // 센서 데이터 포함
            pressure: this.sensorData.pressure,
            acceleration: this.sensorData.acceleration,
          };
          resolve(this.currentLocation);
        },
        (error) => {
          console.error('Location error:', error);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
          distanceFilter: 0,
          accuracy: {
            android: 'high',
            ios: 'bestForNavigation',
          },
          forceRequestLocation: true,
          showLocationDialog: true,
        }
      );
    });
  }

  private stopSensorsIfUnused() {
    if (this.trackingActive || this.watchIds.size > 0) {
      return;
    }

    if (this.barometerSubscription) {
      this.barometerSubscription.unsubscribe();
      this.barometerSubscription = null;
    }

    if (this.accelerometerSubscription) {
      this.accelerometerSubscription.unsubscribe();
      this.accelerometerSubscription = null;
    }
  }

  private toLocation(position: any) {
    const gpsAltitude = position.coords.altitude || 0;
    const accuracy = position.coords.accuracy || 999;
    const fusedAltitude = this.fuseSensorData(gpsAltitude, accuracy);

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      altitude: fusedAltitude,
      gpsAltitude,
      accuracy,
      accuracyLevel: this.getAccuracyLevel(accuracy),
      activeGNSS: this.getActiveGNSS(position),
      speed: position.coords.speed || 0,
      heading: position.coords.heading || 0,
      timestamp: position.timestamp,
      pressure: this.sensorData.pressure,
      acceleration: this.sensorData.acceleration,
    };
  }

  private startNativeWatch(onLocation: WatchCallback, isRemoved: () => boolean) {
    return Geolocation.watchPosition(
      position => {
        if (isRemoved()) {
          return;
        }
        const location = this.toLocation(position);
        this.currentLocation = location;
        onLocation(location);
      },
      error => {
        if (!isRemoved()) {
          console.error('Watch position error:', error);
        }
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 5,
        interval: 2000,
        fastestInterval: 1000,
        forceRequestLocation: true,
        showLocationDialog: true,
        // iOS: 백그라운드에서 위치를 사용하는 동안 상태 막대에 파란색 표시
        showsBackgroundLocationIndicator: true,
        accuracy: {
          android: 'high',
          ios: 'bestForNavigation',
        },
      },
    );
  }

  private pauseIosWatches() {
    this.iosWatches.forEach(watch => {
      if (watch.nativeId !== null) {
        Geolocation.clearWatch(watch.nativeId);
        this.watchIds.delete(watch.nativeId);
        watch.nativeId = null;
      }
    });
    this.stopSensorsIfUnused();
  }

  private resumeIosWatches() {
    this.iosWatches.forEach(watch => {
      if (watch.nativeId === null) {
        this.startBarometer();
        this.startAccelerometer();
        watch.nativeId = this.startNativeWatch(watch.callback, () => !this.iosWatches.has(watch));
        this.watchIds.add(watch.nativeId);
      }
    });
  }

  watchPosition(callback: WatchCallback) {
    let removed = false;
    let localWatchId: number | null = null;
    const iosWatch: IosWatch = {callback, nativeId: null};

    this.requestPermission()
      .then(hasPermission => {
        if (!hasPermission || removed) {
          return;
        }

        this.startBarometer();
        this.startAccelerometer();

        localWatchId = this.startNativeWatch(callback, () => removed);

        if (removed) {
          Geolocation.clearWatch(localWatchId);
          localWatchId = null;
          this.stopSensorsIfUnused();
          return;
        }

        this.watchIds.add(localWatchId);
        if (Platform.OS === 'ios') {
          iosWatch.nativeId = localWatchId;
          this.iosWatches.add(iosWatch);
        }
      })
      .catch(error => {
        if (!removed) {
          console.error('Watch permission error:', error);
        }
        this.stopSensorsIfUnused();
      });

    return {
      remove: () => {
        if (removed) {
          return;
        }

        removed = true;

        if (Platform.OS === 'ios') {
          // 백그라운드 복귀 후 재시작된 경우 nativeId 가 바뀌어 있을 수 있음
          this.iosWatches.delete(iosWatch);
          if (iosWatch.nativeId !== null) {
            localWatchId = iosWatch.nativeId;
          }
        }

        if (localWatchId !== null) {
          Geolocation.clearWatch(localWatchId);
          this.watchIds.delete(localWatchId);
          localWatchId = null;
        }

        this.stopSensorsIfUnused();
      },
    };
  }

  async startTracking() {
    this.trackingActive = true;
    this.resetAltitudeState();
    this.startBarometer();
    this.startAccelerometer();

    try {
      await this.getCurrentPosition();
    } catch (error) {
      // 첫 위치를 못 받아도 활동 기록은 계속되므로(TrackingScreen) trackingActive 는 유지한다.
      // iOS 에서 이 값이 false 가 되면 백그라운드 진입 시 기록용 위치 수신이 멈춘다.
      throw error;
    }
  }

  stopTracking() {
    this.trackingActive = false;
    this.stopSensorsIfUnused();
  }
  getLastKnownLocation() {
    return this.currentLocation;
  }

  /**
   * GNSS 상태 정보 반환
   */
  getGNSSStatus() {
    if (!this.currentLocation) return null;

    return {
      activeGNSS: this.currentLocation.activeGNSS || [],
      accuracy: this.currentLocation.accuracy,
      accuracyLevel: this.currentLocation.accuracyLevel,
      satelliteCount: this.currentLocation.activeGNSS?.length || 0,
      usingSensorFusion: !!this.sensorData.pressure,
    };
  }
}

export default new LocationService();
