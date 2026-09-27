package com.hikerpro;

import android.app.Application;
import com.facebook.react.PackageList;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.facebook.react.defaults.DefaultReactHost;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.react.soloader.OpenSourceMergedSoMapping;
import com.facebook.soloader.SoLoader;
import java.util.List;

public class MainApplication extends Application implements ReactApplication {

  private final ReactNativeHost mReactNativeHost =
      new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
          return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
          @SuppressWarnings("UnnecessaryLocalVariable")
          List<ReactPackage> packages = new PackageList(this).getPackages();
    packages.add(new AdminIdPackage());
          packages.add(new HikerSharePackage());
          // Packages that cannot be autolinked yet can be added manually here
          return packages;
        }

        @Override
        protected String getJSMainModuleName() {
          return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
          return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }
      };

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  // Register HIKERPRO share module for the New Architecture ReactHost path too (autolinked packages unchanged)
  private List<ReactPackage> getReactHostPackages() {
    List<ReactPackage> packages = new PackageList(this).getPackages();
    packages.add(new HikerSharePackage());
    return packages;
  }




  @Override




  public ReactHost getReactHost() {




    return DefaultReactHost.getDefaultReactHost(




        getApplicationContext(),




        getReactHostPackages(),




        "index",




        "index.android.bundle",




        null,




        null,




        BuildConfig.DEBUG,




        java.util.Collections.emptyList(),




        e -> { throw new RuntimeException(e); },




        null);




  }





  @Override




  public void onCreate() {
    super.onCreate();
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      try {
        SoLoader.init(this, OpenSourceMergedSoMapping.INSTANCE);
      } catch (java.io.IOException e) {
        throw new RuntimeException(e);
      }
      DefaultNewArchitectureEntryPoint.load();
    }
  }
}
