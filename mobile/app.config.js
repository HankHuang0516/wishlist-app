const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';

module.exports = {
  expo: {
    name: 'Wishlist.ai',
    slug: 'weeshgifts',
    version: '2.0.7',
    orientation: 'portrait',
    scheme: 'weesh',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: 'com.hankhuang.weesh',
      buildNumber: '5',
      supportsTablet: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        'UISupportedInterfaceOrientations~ipad': [
          'UIInterfaceOrientationPortrait',
          'UIInterfaceOrientationPortraitUpsideDown',
          'UIInterfaceOrientationLandscapeLeft',
          'UIInterfaceOrientationLandscapeRight',
        ],
      },
    },
    android: {
      package: 'com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1',
      versionCode: 22,
      allowBackup: false,
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.RECORD_AUDIO',
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.READ_CONTACTS',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
      ],
    },
    plugins: [
      './plugins/withReleaseSigning',
      './plugins/withIsolatedDebugQa',
      '@maplibre/maplibre-react-native',
      ['expo-location', {
        locationWhenInUsePermission: '用於查找附近商品；也可拒絕定位並手動選擇地區。',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: '使用附近商品地圖定位時，定位元件可能使用裝置動作資訊協助判定方向與移動狀態；不會儲存活動紀錄。',
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      }],
      './plugins/withForegroundOnlyLocation',
      ['expo-image-picker', {
        photosPermission: '選取商品實拍照片，用於願望或商品刊登。',
        cameraPermission: '拍攝商品實拍照片，用於願望或商品刊登。',
        microphonePermission: false,
      }],
      ['expo-secure-store', { configureAndroidBackup: false, faceIDPermission: false }],
      'expo-notifications',
      '@react-native-community/datetimepicker',
    ],
    updates: { enabled: false },
    extra: {
      apiUrl,
      eas: { projectId: '1f7233de-f650-4938-a46d-97b419832519' },
    },
  },
};
