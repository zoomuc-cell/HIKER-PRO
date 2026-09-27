import Geolocation from 'react-native-geolocation-service';
import {PermissionsAndroid, Platform, NativeModules} from 'react-native';
import {accelerometer, barometer} from 'react-native-sensors';

const {LocationManager} = NativeModules;

class LocationService {
  private watchIds = new Set<number>();
  private trackingActive = false;
  currentLocation: any = null;
  barometerSubscription: any = null;
  accelerometerSubscription: any = null;
  
  // ?쇱꽌 ?곗씠?????  
  sensorData: {
    pressure: number | null;
    acceleration: number | null;
    previousAltitude: number | null;
    altitudeHistory: number[];
  } = {
    pressure: null,        // 湲곗븬 (hPa)
    acceleration: null,    // 媛?띾룄
    previousAltitude: null,
    altitudeHistory: [] as number[],
  };

  // GNSS ?뺥솗??湲곗? (誘명꽣)
  accuracyThresholds = {
    excellent: 5,    // 짹5m ?댄븯
    good: 10,        // 짹10m ?댄븯
    moderate: 20,    // 짹20m ?댄븯
    poor: 50,        // 짹50m ?댄븯
  };

  async requestPermission() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Hiker Pro ?꾩튂 沅뚰븳',
          message: 'Hiker Pro媛 硫??GNSS (GPS/GLONASS/BeiDou/Galileo)瑜??댁슜???뺣? ?꾩튂 異붿쟻???꾪빐 沅뚰븳???꾩슂?⑸땲??',
          buttonPositive: '?덉슜',
          buttonNegative: '嫄곕?',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }

  /**
   * 湲곗븬怨?湲곕컲 怨좊룄 怨꾩궛
   * ?쒖? ?湲곗븬 怨듭떇: h = 44330 * (1 - (P/P0)^0.1903)
   */
  calculateAltitudeFromPressure(pressure: number): number {
    const P0 = 1013.25; // ?댁닔硫??쒖? 湲곗븬 (hPa)
    const altitude = 44330 * (1 - Math.pow(pressure / P0, 0.1903));
    return altitude;
  }

  /**
   * 移쇰쭔 ?꾪꽣 媛꾩냼??踰꾩쟾 - 怨좊룄 ?뺥솗???μ긽
   */
  kalmanFilter(measurement: number, previousEstimate: number | null): number {
    if (!previousEstimate) return measurement;
    const Q = 0.01;
    const R = 2.0;
    const K = 1 / (1 + R / Q);
    
    return previousEstimate + K * (measurement - previousEstimate);
  }

  /**
   * ?쇱꽌 ?⑥쟾: GPS + 湲곗븬怨?+ 媛?띾룄怨?   */
  fuseSensorData(gpsAltitude: number, accuracy: number): number {
    let fusedAltitude = gpsAltitude;

    // 1. 湲곗븬怨??곗씠?곌? ?덉쑝硫??듯빀
    if (this.sensorData.pressure) {
      const baroAltitude = this.calculateAltitudeFromPressure(
        this.sensorData.pressure
      );
      
      // GPS ?뺥솗?꾩뿉 ?곕씪 媛以묒튂 議곗젙
      const gpsWeight = Math.min(1, 10 / (accuracy || 10));
      const baroWeight = 1 - gpsWeight;
      
      fusedAltitude = gpsAltitude * gpsWeight + baroAltitude * baroWeight;
    }

    // 2. 移쇰쭔 ?꾪꽣 ?곸슜
    fusedAltitude = this.kalmanFilter(
      fusedAltitude,
      this.sensorData.previousAltitude
    );

    // 3. ?대룞 ?됯퇏 (理쒓렐 5媛??곗씠??
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

  /**
   * 湲곗븬怨??쇱꽌 ?쒖옉
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
   * 媛?띾룄怨??쇱꽌 ?쒖옉 (?吏곸엫 媛먯?)
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
   * GNSS ?뺥솗???됯?
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
   * ?ъ슜 以묒씤 GNSS ?쒖뒪???뺤씤 (Android留?
   */
  getActiveGNSS(position: any): string[] {
    // Android?먯꽌??GnssStatus瑜??듯빐 ?뺤씤 媛??    // ?ш린?쒕뒗 ?뺥솗?꾨줈 異붿젙
    const gnssTypes = [];
    
    if (position.coords.accuracy <= 3) {
      // 理쒓퀬 ?뺥솗?? 5媛??쒖뒪??紐⑤몢 ?쒖꽦
      gnssTypes.push('GPS', 'GLONASS', 'Galileo', 'BeiDou', 'QZSS');
    } else if (position.coords.accuracy <= 5) {
      // ?곗닔: 4媛??쒖뒪??      gnssTypes.push('GPS', 'GLONASS', 'Galileo', 'BeiDou');
    } else if (position.coords.accuracy <= 10) {
      // ?묓샇: 2-3媛??쒖뒪??      gnssTypes.push('GPS', 'GLONASS', 'QZSS');
    } else {
      // 湲곕낯: GPS留?      gnssTypes.push('GPS');
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
          
          // ?쇱꽌 ?⑥쟾?쇰줈 ?뺣? 怨좊룄 怨꾩궛
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
            // ?쇱꽌 ?곗씠???ы븿
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

  watchPosition(callback: (location: any) => void) {
    let removed = false;
    let localWatchId: number | null = null;

    this.requestPermission()
      .then(hasPermission => {
        if (!hasPermission || removed) {
          return;
        }

        this.startBarometer();
        this.startAccelerometer();

        localWatchId = Geolocation.watchPosition(
          position => {
            if (removed) {
              return;
            }

            const gpsAltitude = position.coords.altitude || 0;
            const accuracy = position.coords.accuracy || 999;
            const fusedAltitude = this.fuseSensorData(gpsAltitude, accuracy);

            const location = {
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

            this.currentLocation = location;
            callback(location);
          },
          error => {
            if (!removed) {
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
            accuracy: {
              android: 'high',
              ios: 'bestForNavigation',
            },
          },
        );

        if (removed) {
          Geolocation.clearWatch(localWatchId);
          localWatchId = null;
          this.stopSensorsIfUnused();
          return;
        }

        this.watchIds.add(localWatchId);
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
    this.startBarometer();
    this.startAccelerometer();

    try {
      await this.getCurrentPosition();
    } catch (error) {
      this.trackingActive = false;
      this.stopSensorsIfUnused();
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
   * GNSS ?곹깭 ?뺣낫 諛섑솚
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








