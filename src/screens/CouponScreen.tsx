import React, {useState} from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {Text, Card, Button} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import QRCodeScanner from 'react-native-qrcode-scanner';

const CouponScreen = ({route}: {route: any}) => {
  const [coupons, setCoupons] = useState([
    {
      id: 1,
      restaurant: '산터 막국수',
      discount: '10%',
      code: 'HIKER10',
      expiryDate: '2026-09-13',
      used: false,
    },
    {
      id: 2,
      restaurant: '광교산 칼국수',
      discount: '3,000원',
      code: 'HIKE3000',
      expiryDate: '2026-08-30',
      used: false,
    },
  ]);

  const [scannerVisible, setScannerVisible] = useState(false);

  React.useEffect(() => {
    if (route.params?.newCoupon) {
      const newCoupon = {
        id: coupons.length + 1,
        ...route.params.newCoupon,
        code: `HIKER${Math.floor(Math.random() * 1000)}`,
        used: false,
      };
      setCoupons([...coupons, newCoupon]);
    }
  }, [route.params]);

  const onQRCodeRead = (e: {data: string}) => {
    Alert.alert('QR 코드 스캔 성공', `쿠폰 코드: ${e.data}`, [
      {
        text: '확인',
        onPress: () => setScannerVisible(false),
      },
    ]);
  };

  const useCoupon = (couponId: number) => {
    Alert.alert(
      '쿠폰 사용',
      '이 쿠폰을 사용하시겠습니까?',
      [
        {text: '취소', style: 'cancel'},
        {
          text: '사용',
          onPress: () => {
            setCoupons(
              coupons.map(c =>
                c.id === couponId ? {...c, used: true} : c
              )
            );
            Alert.alert('성공', '쿠폰을 사용했습니다.');
          },
        },
      ]
    );
  };

  if (scannerVisible) {
    return (
      <View style={styles.container}>
        <QRCodeScanner
          onRead={onQRCodeRead}
          topContent={
            <Text style={styles.scannerText}>
              맛집의 QR 코드를 스캔하세요</Text>
          }
          bottomContent={
            <Button
              mode="contained"
              onPress={() => setScannerVisible(false)}>
              취소
            </Button>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Icon name="ticket" size={32} color="#2E7D32" />
        <Text style={styles.headerText}>내 쿠폰 ({coupons.filter(c => !c.used).length})</Text>
      </View>

      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => setScannerVisible(true)}>
        <Icon name="qrcode-scan" size={24} color="white" />
        <Text style={styles.scanButtonText}>QR 코드 스캔</Text>
      </TouchableOpacity>

      <ScrollView style={styles.scrollView}>
        {coupons.map((coupon) => (
          <Card
            key={coupon.id}
            style={[
              styles.couponCard,
              coupon.used && styles.usedCouponCard,
            ]}>
            <Card.Content>
              <View style={styles.couponHeader}>
                <Text style={styles.restaurantName}>{coupon.restaurant}</Text>
                {coupon.used && (
                  <View style={styles.usedBadge}>
                    <Text style={styles.usedText}>사용완료</Text>
                  </View>
                )}
              </View>

              <Text style={styles.discountText}>{coupon.discount} 할인</Text>

              <View style={styles.codeContainer}>
                <Icon name="barcode" size={20} color="#666" />
                <Text style={styles.codeText}>{coupon.code}</Text>
              </View>

              <View style={styles.expiryRow}>
                <Icon name="calendar" size={16} color="#666" />
                <Text style={styles.expiryText}>
                  유효기간: {coupon.expiryDate}
                </Text>
              </View>

              {!coupon.used && (
                <Button
                  mode="contained"
                  buttonColor="#2E7D32"
                  icon="check"
                  onPress={() => useCoupon(coupon.id)}
                  style={styles.useButton}>
                  쿠폰 사용하기
                </Button>
              )}
            </Card.Content>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 12,
    color: '#333',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2E7D32',
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  scanButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  scrollView: {
    flex: 1,
  },
  couponCard: {
    margin: 12,
    marginBottom: 8,
    elevation: 3,
    backgroundColor: 'white',
  },
  usedCouponCard: {
    opacity: 0.5,
    backgroundColor: '#f0f0f0',
  },
  couponHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  usedBadge: {
    backgroundColor: '#9E9E9E',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  usedText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  discountText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF5722',
    marginBottom: 12,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  codeText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  expiryText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#666',
  },
  useButton: {
    marginTop: 8,
  },
  scannerText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
});

export default CouponScreen;



