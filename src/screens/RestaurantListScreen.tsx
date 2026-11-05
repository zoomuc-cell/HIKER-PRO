import React, {useEffect, useState} from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import {Text, Card, Button, Chip} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {restaurants} from '../assets/data/restaurants';

const RestaurantListScreen = ({route, navigation}: {route: any; navigation: any}) => {
  const [selectedRestaurant, setSelectedRestaurant] = useState<(typeof restaurants)[number] | null>(null);

  useEffect(() => {
    if (route.params?.restaurant) {
      setSelectedRestaurant(route.params.restaurant);
    }
  }, [route.params]);

  const handleGetCoupon = (restaurant: (typeof restaurants)[number]) => {
    Alert.alert(
      '쿠폰 받기',
      `${restaurant.name}의 10% 할인 쿠폰을 받으시겠습니까?`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: '받기',
          onPress: () => {
            navigation.navigate('Coupons', {
              newCoupon: {
                restaurant: restaurant.name,
                discount: '10%',
                expiryDate: '2026-09-13',
              },
            });
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Icon name="silverware-fork-knife" size={32} color="#2E7D32" />
        <Text style={styles.headerText}>주변 맛집 ({restaurants.length})</Text>
      </View>

      {restaurants.map((restaurant, index) => (
        <Card key={index} style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <View style={styles.nameRow}>
                <Text style={styles.restaurantName}>{restaurant.name}</Text>
                {restaurant.hasDiscount && (
                  <Chip
                    icon="ticket"
                    textStyle={styles.chipText}
                    style={styles.discountChip}>
                    10% 할인
                  </Chip>
                )}
              </View>
              <Text style={styles.cuisine}>{restaurant.cuisine}</Text>
            </View>

            <View style={styles.infoRow}>
              <Icon name="map-marker" size={16} color="#666" />
              <Text style={styles.infoText}>{restaurant.distance}</Text>
            </View>

            <View style={styles.infoRow}>
              <Icon name="star" size={16} color="#FFC107" />
              <Text style={styles.infoText}>
                {restaurant.rating} ({restaurant.reviews}개 리뷰)
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Icon name="clock-outline" size={16} color="#666" />
              <Text style={styles.infoText}>{restaurant.hours}</Text>
            </View>

            <Text style={styles.description}>{restaurant.description}</Text>

            <View style={styles.buttonRow}>
              <Button
                mode="outlined"
                icon="phone"
                onPress={() => Alert.alert('전화', restaurant.phone)}
                style={styles.actionButton}>
                전화
              </Button>
              <Button
                mode="outlined"
                icon="directions"
                onPress={() =>
                  Alert.alert('길찾기', `${restaurant.name}으로 안내를 시작합니다.`)
                }
                style={styles.actionButton}>
                길찾기
              </Button>
              {restaurant.hasDiscount && (
                <Button
                  mode="contained"
                  icon="ticket"
                  buttonColor="#2E7D32"
                  onPress={() => handleGetCoupon(restaurant)}
                  style={styles.actionButton}>
                  쿠폰받기
                </Button>
              )}
            </View>
          </Card.Content>
        </Card>
      ))}
    </ScrollView>
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
  card: {
    margin: 12,
    marginBottom: 8,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cuisine: {
    fontSize: 14,
    color: '#666',
  },
  discountChip: {
    backgroundColor: '#FF5722',
  },
  chipText: {
    color: 'white',
    fontSize: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  infoText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#666',
  },
  description: {
    marginTop: 12,
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
});

export default RestaurantListScreen;


