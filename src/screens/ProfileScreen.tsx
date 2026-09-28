import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  Modal,
  Switch,
  Share,
  Linking,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {launchImageLibrary, launchCamera} from 'react-native-image-picker';
import DeviceInfo from 'react-native-device-info';
import ReactNativeBlobUtil from 'react-native-blob-util';

const ADMIN_DEVICE_IDS = ['9da67a462cc43660'];

const DEFAULT_USER = {
  name: '사용자',
  email: 'admin@auratechnologies.kr',
  hikingLevel: '중급',
  totalHikes: 42,
  totalDistance: 156.4,
  age: null as number | null,
  gender: '' as string,
  heightCm: null as number | null,
  weightKg: null as number | null,
};

const hashPin = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return 'h' + (h >>> 0).toString(36);
};

const formatDateText = (iso?: string | null) => {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일까지 사용 가능`;
};

const ProfileScreen = () => {
  const [user, setUser] = useState(DEFAULT_USER);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [editWeight, setEditWeight] = useState('');

  const [notiVisible, setNotiVisible] = useState(false);
  const [notiEnabled, setNotiEnabled] = useState(true);

  const [mapVisible, setMapVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  const [contactVisible, setContactVisible] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [upgVisible, setUpgVisible] = useState(false);
  const [proActive, setProActive] = useState(false);
  const [passInfo, setPassInfo] = useState<any>(null);

  const [adminStage, setAdminStage] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [adminDevId, setAdminDevId] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const savedUser = await AsyncStorage.getItem('hiker_user');
        const savedNoti = await AsyncStorage.getItem('hiker_noti');
        const savedAvatar = await AsyncStorage.getItem('hiker_avatar');
        const savedPro = await AsyncStorage.getItem('hiker_pro');
        const savedPass = await AsyncStorage.getItem('hiker_tourist_pass');
        const savedContact = await AsyncStorage.getItem('hiker_emergency_contact');

        if (savedUser) {
          setUser({...DEFAULT_USER, ...JSON.parse(savedUser)});
        }
        if (savedNoti !== null) {
          setNotiEnabled(savedNoti === '1');
        }
        if (savedAvatar) {
          setAvatarUri(savedAvatar);
        }
        if (savedPro === '1') {
          setProActive(true);
        }
        if (savedContact) {
          try {
            const c = JSON.parse(savedContact);
            setContactName(c?.name || '');
            setContactPhone(c?.phone || '');
          } catch (e) {}
        }
        if (savedPass) {
          try {
            const parsed = JSON.parse(savedPass);
            if (parsed?.expiry && new Date(parsed.expiry).getTime() > Date.now()) {
              setPassInfo(parsed);
            } else {
              await AsyncStorage.removeItem('hiker_tourist_pass');
              setPassInfo(null);
            }
          } catch (e) {
            setPassInfo(null);
          }
        }
      } catch (e) {}
    };
    load();
  }, []);

  const saveAvatarBase64 = async (base64: string) => {
    const dest = ReactNativeBlobUtil.fs.dirs.DocumentDir + '/hiker_avatar.jpg';
    await ReactNativeBlobUtil.fs.writeFile(dest, base64, 'base64');
    const nextUri = 'file://' + dest + '?t=' + Date.now();
    await AsyncStorage.setItem('hiker_avatar', nextUri);
    setAvatarUri(nextUri);
  };

  const openGallery = async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: true,
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.9,
      });
      if (res.didCancel) {
        return;
      }
      if (res.errorCode) {
        Alert.alert('오류', '갤러리 이미지를 불러오지 못했습니다: ' + (res.errorMessage || res.errorCode));
        return;
      }
      const asset = res.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('오류', '선택한 이미지 데이터를 읽지 못했습니다.');
        return;
      }
      await saveAvatarBase64(asset.base64);
      Alert.alert('완료', '프로필 이미지가 변경되었습니다.');
    } catch (e) {
      Alert.alert('오류', '갤러리 이미지 처리 중 문제가 발생했습니다.');
    }
  };

  const openCamera = async () => {
    try {
      const res = await launchCamera({
        mediaType: 'photo',
        includeBase64: true,
        saveToPhotos: false,
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.9,
      });
      if (res.didCancel) {
        return;
      }
      if (res.errorCode) {
        Alert.alert('오류', '카메라 사진을 불러오지 못했습니다: ' + (res.errorMessage || res.errorCode));
        return;
      }
      const asset = res.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('오류', '촬영한 이미지 데이터를 읽지 못했습니다.');
        return;
      }
      await saveAvatarBase64(asset.base64);
      Alert.alert('완료', '프로필 이미지가 변경되었습니다.');
    } catch (e) {
      Alert.alert('오류', '카메라 이미지 처리 중 문제가 발생했습니다.');
    }
  };

  const clearAvatar = async () => {
    await AsyncStorage.removeItem('hiker_avatar');
    setAvatarUri(null);
    Alert.alert('완료', '기본 아이콘으로 돌아갔습니다.');
  };

  const openAvatarMenu = () => {
    Alert.alert('프로필 이미지', '변경 방법을 선택해 주세요.', [
      {text: '갤러리에서 선택', onPress: openGallery},
      {text: '사진 촬영', onPress: openCamera},
      {text: '기본 아이콘으로', onPress: clearAvatar},
      {text: '취소', style: 'cancel'},
    ]);
  };

  const openEdit = () => {
    setEditName(user?.name || '');
    setEditEmail(user?.email || '');
    setEditAge(user?.age != null ? String(user.age) : '');
    setEditGender(user?.gender || '');
    setEditHeight(user?.heightCm != null ? String(user.heightCm) : '');
    setEditWeight(user?.weightKg != null ? String(user.weightKg) : '');
    setEditVisible(true);
  };

  const saveProfile = async () => {
    const age = editAge.trim() ? Number(editAge) : null;
    const heightCm = editHeight.trim() ? Number(editHeight) : null;
    const weightKg = editWeight.trim() ? Number(editWeight) : null;

    if (age !== null && (!Number.isFinite(age) || age < 10 || age > 120)) {
      Alert.alert('입력 확인', '나이는 10~120세 범위로 입력해주세요.');
      return;
    }

    if (
      heightCm !== null &&
      (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250)
    ) {
      Alert.alert('입력 확인', '키는 100~250cm 범위로 입력해주세요.');
      return;
    }

    if (
      weightKg !== null &&
      (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 300)
    ) {
      Alert.alert('입력 확인', '체중은 25~300kg 범위로 입력해주세요.');
      return;
    }

    const previousWeight =
      typeof user?.weightKg === 'number' ? user.weightKg : null;

    const nextUser = {
      ...user,
      name: (editName || '').trim() || '사용자',
      email: (editEmail || '').trim() || 'admin@auratechnologies.kr',
      age,
      gender: editGender,
      heightCm,
      weightKg,
    };

    if (weightKg !== null && previousWeight !== weightKg) {
      try {
        const savedHistory = await AsyncStorage.getItem('hiker_weight_history');
        const parsedHistory = savedHistory ? JSON.parse(savedHistory) : [];
        const history = Array.isArray(parsedHistory) ? parsedHistory : [];

        history.push({
          changedAt: new Date().toISOString(),
          previousWeightKg: previousWeight,
          weightKg,
        });

        await AsyncStorage.setItem(
          'hiker_weight_history',
          JSON.stringify(history),
        );
      } catch (e) {}
    }

    setUser(nextUser);
    await AsyncStorage.setItem('hiker_user', JSON.stringify(nextUser));
    setEditVisible(false);
    Alert.alert('완료', '프로필이 저장되었습니다.');
  };

  const toggleNotifications = async (value: boolean) => {
    setNotiEnabled(value);
    await AsyncStorage.setItem('hiker_noti', value ? '1' : '0');
  };

  const openContact = () => {
    setContactVisible(true);
  };

  const saveContact = async () => {
    if (!contactPhone.trim()) {
      Alert.alert('알림', '전화번호를 입력해 주세요.');
      return;
    }
    const payload = {
      name: contactName.trim(),
      phone: contactPhone.trim(),
    };
    await AsyncStorage.setItem('hiker_emergency_contact', JSON.stringify(payload));
    setContactVisible(false);
    Alert.alert('완료', '비상 연락처가 저장되었습니다.');
  };

  const shareApp = async () => {
    try {
      await Share.share({
        message: 'Hiker Pro - 등산의 모든 것. 오프라인 지도, 안심산행, 스탬프북까지 함께하세요.',
      });
    } catch (e) {}
  };

  const requestUpgrade = async (plan: string) => {
    const label = String(plan || 'Pro');
    const stamp = new Date().toISOString() + '|' + label;
    await AsyncStorage.setItem('hiker_upgrade_requested', stamp);

    if (label.indexOf('관광') >= 0) {
      const now = new Date();
      const expiry = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const pass = {
        start: now.toISOString(),
        expiry: expiry.toISOString(),
      };
      await AsyncStorage.setItem('hiker_tourist_pass', JSON.stringify(pass));
      setPassInfo(pass);
    }

    setUpgVisible(false);
    Alert.alert('신청 완료', label + ' 신청이 저장되었습니다.');
  };

  const showRequests = async () => {
    const req = await AsyncStorage.getItem('hiker_upgrade_requested');
    const pass = await AsyncStorage.getItem('hiker_tourist_pass');

    const rows: string[] = [];
    if (req) {
      rows.push('업그레이드 신청: ' + req);
    }
    if (pass) {
      try {
        const p = JSON.parse(pass);
        rows.push('관광객 이용권 만료: ' + (p.expiry || '정보 없음'));
      } catch (e) {
        rows.push('관광객 이용권 데이터가 저장되어 있습니다.');
      }
    }

    Alert.alert('신청 내역', rows.length ? rows.join('\n') : '신청 내역이 없습니다.');
  };

  const togglePro = async () => {
    const next = !proActive;
    setProActive(next);
    await AsyncStorage.setItem('hiker_pro', next ? '1' : '0');
    Alert.alert('완료', next ? 'Pro가 활성화되었습니다.' : 'Pro가 비활성화되었습니다.');
  };

  const resetPin = async () => {
    await AsyncStorage.removeItem('admin_pin');
    setPinInput('');
    setPinError('');
    setAdminStage('setPin');
  };

  const resetAppData = () => {
    Alert.alert('앱 데이터 초기화', '앱의 저장 데이터를 모두 지웁니다. 계속할까요?', [
      {text: '취소', style: 'cancel'},
      {
        text: '초기화',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          setUser(DEFAULT_USER);
          setAvatarUri(null);
          setNotiEnabled(true);
          setProActive(false);
          setPassInfo(null);
          setContactName('');
          setContactPhone('');
          setAdminStage(null);
          Alert.alert('완료', '초기화되었습니다.');
        },
      },
    ]);
  };

  const enterAdmin = async () => {
    let devId = '';
    try {
      devId = (await DeviceInfo.getAndroidId()) || '';
    } catch (e) {
      devId = '';
    }
    const normId = String(devId).trim().toLowerCase();
    const allow = ADMIN_DEVICE_IDS.map(x => String(x).trim().toLowerCase());
    if (!normId || allow.indexOf(normId) < 0) {
      Alert.alert('접근 거부', '관리자 기기가 아닙니다.');
      return;
    }
    setAdminDevId(normId);
    const saved = await AsyncStorage.getItem('admin_pin');
    setPinInput('');
    setPinError('');
    setAdminStage(saved ? 'pin' : 'setPin');
  };

  const submitPin = async () => {
    const saved = await AsyncStorage.getItem('admin_pin');
    if (adminStage === 'setPin') {
      if (pinInput.length < 4) {
        setPinError('4자리 이상 입력하세요.');
        return;
      }
      await AsyncStorage.setItem('admin_pin', hashPin(pinInput));
      setPinInput('');
      setPinError('');
      setAdminStage('panel');
      return;
    }
    if (adminStage === 'pin') {
      if (hashPin(pinInput) === saved) {
        setPinInput('');
        setPinError('');
        setAdminStage('panel');
      } else {
        setPinError('PIN이 틀렸습니다.');
      }
    }
  };

  const menuItems = [
    {
      key: 'edit',
      icon: 'account-edit-outline',
      title: '프로필 수정',
      sub: '이름과 이메일을 변경합니다',
      onPress: openEdit,
    },
    {
      key: 'noti',
      icon: 'bell-outline',
      title: '알림 설정',
      sub: '알림 수신 여부를 조정합니다',
      onPress: () => setNotiVisible(true),
    },
    {
      key: 'contact',
      icon: 'card-account-phone-outline',
      title: '비상 연락처',
      sub: '긴급 시 연락할 지인을 등록합니다',
      onPress: openContact,
    },
    {
      key: 'share',
      icon: 'share-variant-outline',
      title: '친구에게 앱 공유',
      sub: '카톡·문자·SNS로 공유합니다',
      onPress: shareApp,
    },
    {
      key: 'map',
      icon: 'map-marker-path',
      title: '오프라인 지도',
      sub: '오프라인 지도 기능 안내',
      onPress: () => setMapVisible(true),
    },
    {
      key: 'history',
      icon: 'history',
      title: '등산 히스토리',
      sub: '기록 관리 기능 안내',
      onPress: () => setHistoryVisible(true),
    },
    {
      key: 'privacy',
      icon: 'shield-check-outline',
      title: '개인정보 보호',
      sub: '저장 데이터와 보호 정책 안내',
      onPress: () => setPrivacyVisible(true),
    },
    {
      key: 'help',
      icon: 'help-circle-outline',
      title: '도움말 / 불편 신고',
      sub: 'admin@auratechnologies.kr',
      onPress: () => setHelpVisible(true),
    },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={openAvatarMenu}
            onLongPress={enterAdmin}
            delayLongPress={1500}>
            {avatarUri ? (
              <Image source={{uri: avatarUri}} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Icon name="account" size={42} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>

          <View style={styles.badge}>
            <Icon
              name={proActive ? 'crown' : 'account-outline'}
              size={16}
              color={proActive ? '#FFD54F' : '#E8F5E9'}
            />
            <Text style={styles.badgeText}>{proActive ? 'Hiker Pro 활성' : '일반 사용자'}</Text>
          </View>

          {passInfo?.expiry ? (
            <View style={styles.passBanner}>
              <Icon name="ticket-confirmation-outline" size={16} color="#F57C00" />
              <Text style={styles.passText}>관광객 이용권: {formatDateText(passInfo.expiry)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user.totalHikes}</Text>
            <Text style={styles.statLabel}>총 산행</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user.totalDistance}</Text>
            <Text style={styles.statLabel}>누적 거리(km)</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{user.hikingLevel}</Text>
            <Text style={styles.statLabel}>등산 레벨</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>멤버십</Text>
            <TouchableOpacity onPress={() => setUpgVisible(true)}>
              <Text style={styles.cardLink}>업그레이드</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.cardDesc}>
            월간 Pro ₩2,900 / 연간 Pro ₩29,000 / 관광객 이용권 ₩1,500
          </Text>
        </View>

        <View style={styles.card}>
          {menuItems.map(item => (
            <TouchableOpacity key={item.key} style={styles.menuBtn} onPress={item.onPress}>
              <View style={styles.menuLeft}>
                <View style={styles.menuIcon}>
                  <Icon name={item.icon} size={20} color="#2E7D32" />
                </View>
                <View style={styles.menuTextWrap}>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSub}>{item.sub}</Text>
                </View>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() =>
            Alert.alert(
              '프로필 초기화',
              '저장된 닉네임과 프로필 사진을 지우고 기본 상태로 돌아갈까요?',
              [
                {text: '취소', style: 'cancel'},
                {
                  text: '초기화',
                  style: 'destructive',
                  onPress: async () => {
                    await AsyncStorage.removeItem('hiker_user');
                    await AsyncStorage.removeItem('hiker_avatar');
                    await AsyncStorage.removeItem('hiker_weight_history');
                    setAvatarUri(null);
                    setUser(DEFAULT_USER);
                    Alert.alert('완료', '프로필이 초기화되었습니다.');
                  },
                },
              ],
            )
          }>
          <Text style={styles.logoutText}>프로필 초기화</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={editVisible} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={[styles.modalCard, styles.profileEditCard]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{'프로필 수정'}</Text>

              <Text style={styles.inputLabel}>{'이름'}</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
              />

              <Text style={styles.inputLabel}>{'이메일'}</Text>
              <TextInput
                style={styles.input}
                value={editEmail}
                onChangeText={setEditEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <View style={styles.activityInfoBox}>
                <Text style={styles.activityInfoTitle}>
                  {'활동 분석을 위한 선택 정보'}
                </Text>
                <Text style={styles.activityInfoText}>
                  {'나이, 성별, 키, 체중은 활동 중 예상 칼로리 소모량과 활동 경향을 보다 알기 쉽게 보여주기 위한 보조 정보입니다. 입력하지 않아도 HIKERPRO의 주요 기능을 이용할 수 있습니다.'}
                </Text>
              </View>

              <Text style={styles.inputLabel}>{'나이 (선택)'}</Text>
              <TextInput
                style={styles.input}
                value={editAge}
                onChangeText={setEditAge}
                keyboardType="number-pad"
                placeholder={'예: 45'}
              />

              <Text style={styles.inputLabel}>{'성별 (선택)'}</Text>
              <View style={styles.genderRow}>
                {[
                  {key: '', label: '선택 안 함'},
                  {key: 'male', label: '남성'},
                  {key: 'female', label: '여성'},
                ].map(item => (
                  <TouchableOpacity
                    key={item.key || 'none'}
                    style={[
                      styles.genderBtn,
                      editGender === item.key && styles.genderBtnActive,
                    ]}
                    onPress={() => setEditGender(item.key)}>
                    <Text
                      style={[
                        styles.genderBtnText,
                        editGender === item.key && styles.genderBtnTextActive,
                      ]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{'키 cm (선택)'}</Text>
              <TextInput
                style={styles.input}
                value={editHeight}
                onChangeText={setEditHeight}
                keyboardType="decimal-pad"
                placeholder={'예: 170'}
              />

              <Text style={styles.inputLabel}>{'체중 kg (선택)'}</Text>
              <TextInput
                style={styles.input}
                value={editWeight}
                onChangeText={setEditWeight}
                keyboardType="decimal-pad"
                placeholder={'예: 70'}
              />
              <Text style={styles.weightHelpText}>
                {'체중은 예상 칼로리 계산에 반영됩니다. 변경 시 변경 이력을 저장하여 활동 기록의 계산 일관성을 유지합니다.'}
              </Text>

              <TouchableOpacity style={styles.primaryBtn} onPress={saveProfile}>
                <Text style={styles.primaryBtnText}>{'저장'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setEditVisible(false)}>
                <Text style={styles.closeBtnText}>{'닫기'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={notiVisible} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>알림 설정</Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>푸시 알림 받기</Text>
              <Switch value={notiEnabled} onValueChange={toggleNotifications} />
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setNotiVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={contactVisible} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>비상 연락처</Text>
            <Text style={styles.inputLabel}>이름</Text>
            <TextInput style={styles.input} value={contactName} onChangeText={setContactName} />
            <Text style={styles.inputLabel}>전화번호</Text>
            <TextInput
              style={styles.input}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={saveContact}>
              <Text style={styles.primaryBtnText}>저장</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setContactVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={mapVisible} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>오프라인 지도</Text>
            <Text style={styles.bodyText}>오프라인 지도 기능은 준비 중입니다.</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setMapVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={historyVisible} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>등산 히스토리</Text>
            <Text style={styles.bodyText}>등산 기록은 차후 상세 기능으로 확장됩니다.</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setHistoryVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={privacyVisible} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>개인정보 보호</Text>
            <Text style={styles.bodyText}>
              프로필 데이터와 설정 정보는 현재 기기 내부에 저장됩니다.
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPrivacyVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={helpVisible} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>도움말 / 불편 신고</Text>
            <Text style={styles.bodyText}>
              사용자 불편 신고는 admin@auratechnologies.kr로 연락해 주세요.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() =>
                Linking.openURL(
                  'mailto:admin@auratechnologies.kr?subject=' +
                    encodeURIComponent('Hiker Pro 사용자 불편 신고'),
                )
              }>
              <Text style={styles.primaryBtnText}>이메일 보내기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setHelpVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={upgVisible} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>멤버십 업그레이드</Text>

            <TouchableOpacity style={styles.planCard} onPress={() => requestUpgrade('월간 Pro ₩2,900')}>
              <Text style={styles.planTitle}>월간 Pro</Text>
              <Text style={styles.planSub}>₩2,900 / 월</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.planCard} onPress={() => requestUpgrade('연간 Pro ₩29,000')}>
              <Text style={styles.planTitle}>연간 Pro</Text>
              <Text style={styles.planSub}>₩29,000 / 년</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.planCard} onPress={() => requestUpgrade('관광객 이용권 ₩1,500')}>
              <Text style={styles.planTitle}>관광객 이용권</Text>
              <Text style={styles.planSub}>₩1,500 / 5일 유효</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setUpgVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!adminStage} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.modalCard}>
            {adminStage === 'setPin' && (
              <>
                <Text style={styles.modalTitle}>관리자 PIN 설정</Text>
                <TextInput
                  style={styles.input}
                  value={pinInput}
                  onChangeText={setPinInput}
                  keyboardType="number-pad"
                  secureTextEntry
                  placeholder="4자리 이상"
                />
                {!!pinError && <Text style={styles.errorText}>{pinError}</Text>}
                <TouchableOpacity style={styles.primaryBtn} onPress={submitPin}>
                  <Text style={styles.primaryBtnText}>저장</Text>
                </TouchableOpacity>
              </>
            )}

            {adminStage === 'pin' && (
              <>
                <Text style={styles.modalTitle}>관리자 PIN 입력</Text>
                <Text style={styles.bodyText}>기기 ID: {adminDevId}</Text>
                <TextInput
                  style={styles.input}
                  value={pinInput}
                  onChangeText={setPinInput}
                  keyboardType="number-pad"
                  secureTextEntry
                  placeholder="PIN 입력"
                />
                {!!pinError && <Text style={styles.errorText}>{pinError}</Text>}
                <TouchableOpacity style={styles.primaryBtn} onPress={submitPin}>
                  <Text style={styles.primaryBtnText}>확인</Text>
                </TouchableOpacity>
              </>
            )}

            {adminStage === 'panel' && (
              <>
                <Text style={styles.modalTitle}>관리자 패널</Text>

                <TouchableOpacity style={styles.primaryBtn} onPress={togglePro}>
                  <Text style={styles.primaryBtnText}>
                    {proActive ? 'Pro 비활성화' : 'Pro 활성화'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.primaryBtn} onPress={showRequests}>
                  <Text style={styles.primaryBtnText}>업그레이드 신청 내역</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.primaryBtn} onPress={resetPin}>
                  <Text style={styles.primaryBtnText}>PIN 재설정</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, styles.dangerBtn]}
                  onPress={resetAppData}>
                  <Text style={styles.primaryBtnText}>앱 데이터 초기화</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setAdminStage(null)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: '#F5F5F5'},
  container: {flex: 1, backgroundColor: '#F5F5F5'},
  content: {paddingBottom: 28},
  header: {
    backgroundColor: '#2E7D32',
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  avatarWrap: {
    marginBottom: 10,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  email: {
    color: '#E8F5E9',
    fontSize: 14,
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginLeft: 6,
    fontWeight: '600',
  },
  passBanner: {
    marginTop: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passText: {
    color: '#E65100',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginTop: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 4,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 8,
    elevation: 1,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#222',
  },
  cardLink: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '700',
  },
  cardDesc: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    fontSize: 13,
    color: '#666',
    lineHeight: 19,
  },
  menuBtn: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuTextWrap: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  menuSub: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },
  menuArrow: {
    fontSize: 24,
    color: '#9E9E9E',
    marginLeft: 10,
  },
  logoutButton: {
    marginHorizontal: 14,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#D32F2F',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
  },
  logoutText: {
    color: '#C62828',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBack: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
  },
  profileEditCard: {
    maxHeight: '88%',
  },
  activityInfoBox: {
    backgroundColor: '#F3F8F3',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    marginBottom: 8,
  },
  activityInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 5,
  },
  activityInfoText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  genderRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  genderBtn: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    backgroundColor: '#FAFAFA',
  },
  genderBtnActive: {
    borderColor: '#2E7D32',
    backgroundColor: '#E8F5E9',
  },
  genderBtnText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  genderBtnTextActive: {
    color: '#2E7D32',
    fontWeight: '700',
  },
  weightHelpText: {
    fontSize: 11,
    color: '#777',
    lineHeight: 17,
    marginTop: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222',
    backgroundColor: '#FAFAFA',
  },
  primaryBtn: {
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    marginTop: 10,
    backgroundColor: '#F1F3F4',
  },
  closeBtnText: {
    color: '#444',
    fontSize: 15,
    fontWeight: '700',
  },
  dangerBtn: {
    backgroundColor: '#C62828',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 54,
  },
  switchLabel: {
    fontSize: 16,
    color: '#222',
    fontWeight: '600',
  },
  bodyText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 21,
  },
  errorText: {
    color: '#C62828',
    marginTop: 8,
    fontSize: 13,
  },
  planCard: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    backgroundColor: '#FCFCFC',
  },
  planTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  planSub: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
});

export default ProfileScreen;