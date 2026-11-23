// ⬇️ ఈ మొదటి line ని మీ MainActivity.java లో ఉన్న "package ..." line తో EXACT గా మార్చండి
package com.eurobond.crm;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* Screenshot guard — JS నుంచి ScreenGuard.setSecure({secure:true/false}) పిలిస్తే
   Android FLAG_SECURE ని on/off చేస్తుంది. secure=true అయితే screenshots block,
   user try చేస్తే Android తన సొంత "couldn't capture screenshot" notice చూపిస్తుంది. */
@CapacitorPlugin(name = "ScreenGuard")
public class ScreenGuardPlugin extends Plugin {
  @PluginMethod
  public void setSecure(PluginCall call) {
    final boolean secure = call.getBoolean("secure", true);
    getActivity().runOnUiThread(new Runnable() {
      @Override
      public void run() {
        if (secure) {
          getActivity().getWindow().setFlags(
              WindowManager.LayoutParams.FLAG_SECURE,
              WindowManager.LayoutParams.FLAG_SECURE);
        } else {
          getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
      }
    });
    call.resolve();
  }
}
