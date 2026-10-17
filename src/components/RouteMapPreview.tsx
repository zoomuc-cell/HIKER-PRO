import React, {forwardRef} from 'react';
import {Platform, StyleSheet, StyleProp, ViewStyle} from 'react-native';
import MapView, {Marker, Polyline, PROVIDER_GOOGLE} from 'react-native-maps';

// 활동 경로 지도 (TrackingScreen 의 경로·사진 보기와 같은 표현: 녹색 Polyline, 사진 위치 Marker)
// 실제 저장된 routePoints / photos 좌표만 사용하며 좌표를 보정하거나 생성하지 않는다.

export type RoutePoint = {latitude: number; longitude: number};
export type RoutePhotoMarker = {id: string; latitude: number; longitude: number};

export const isValidCoord = (p: any): p is RoutePoint =>
  !!p &&
  typeof p.latitude === 'number' &&
  typeof p.longitude === 'number' &&
  Number.isFinite(p.latitude) &&
  Number.isFinite(p.longitude) &&
  Math.abs(p.latitude) <= 90 &&
  Math.abs(p.longitude) <= 180 &&
  !(p.latitude === 0 && p.longitude === 0);

export const MIN_ROUTE_POINTS = 2;

export const getValidRoutePoints = (points: unknown): RoutePoint[] =>
  Array.isArray(points)
    ? points
        .filter(isValidCoord)
        .map(p => ({latitude: p.latitude, longitude: p.longitude}))
    : [];

export const getPhotoMarkers = (photos: unknown): RoutePhotoMarker[] =>
  Array.isArray(photos)
    ? photos
        .filter(p => isValidCoord(p) && typeof (p as any).id === 'string')
        .map((p: any) => ({id: p.id, latitude: p.latitude, longitude: p.longitude}))
    : [];

// 실제 경로 범위로 지도 영역 계산
export const regionForRoute = (points: RoutePoint[]) => {
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.004),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.004),
  };
};

type Props = {
  points: RoutePoint[];
  photoMarkers?: RoutePhotoMarker[];
  style?: StyleProp<ViewStyle>;
  onMapLoaded?: () => void;
};

const RouteMapPreview = forwardRef<MapView, Props>(
  ({points, photoMarkers = [], style, onMapLoaded}, ref) => {
    if (points.length === 0) {
      return null;
    }
    const start = points[0];
    const end = points[points.length - 1];
    return (
      <MapView
        ref={ref}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={[styles.map, style]}
        initialRegion={regionForRoute(points)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onMapLoaded={onMapLoaded}>
        {points.length >= MIN_ROUTE_POINTS && (
          <Polyline coordinates={points} strokeColor="#2E7D32" strokeWidth={4} />
        )}
        <Marker coordinate={start} pinColor="green" title="출발" />
        {points.length > 1 && <Marker coordinate={end} pinColor="red" title="도착" />}
        {photoMarkers.map(photo => (
          <Marker
            key={photo.id}
            coordinate={{latitude: photo.latitude, longitude: photo.longitude}}
            pinColor="azure"
            title="사진"
          />
        ))}
      </MapView>
    );
  },
);

const styles = StyleSheet.create({
  map: {
    width: '100%',
    height: 280,
  },
});

export default RouteMapPreview;
