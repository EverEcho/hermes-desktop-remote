package cn.bit13.rhermes;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OAuthWebViewPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
