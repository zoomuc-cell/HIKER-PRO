// HikerShareModule.swift 를 React Native 에 노출 (JS: NativeModules.HikerShare)
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HikerShare, NSObject)

RCT_EXTERN_METHOD(shareText:(NSString *)message
                  title:(NSString *)title
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(shareImage:(NSString *)path
                  message:(NSString *)message
                  title:(NSString *)title
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(copyText:(NSString *)text
                  label:(NSString *)label
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(composeActivityCard:(NSString *)mapPath
                  title:(NSString *)title
                  rows:(NSArray *)rows
                  footer:(NSString *)footer
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
