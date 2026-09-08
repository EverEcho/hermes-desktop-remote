package cn.bit13.rhermes;

import android.app.AlertDialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hosts native OAuth in an application WebView and consumes the exact loopback
 * callback before WebView attempts to request it. The callback URL remains an
 * RFC 8252-compliant HTTP loopback literal for the Gateway.
 */
@CapacitorPlugin(name = "OAuthWebView")
public class OAuthWebViewPlugin extends Plugin {
    private AlertDialog dialog;
    private Uri expectedRedirect;
    private PluginCall pendingCall;

    @PluginMethod
    public void open(PluginCall call) {
        String authorizeUrl = call.getString("authorizeUrl");
        String redirectUri = call.getString("redirectUri");

        Uri authorization = parseHttpUrl(authorizeUrl);
        Uri redirect = parseLoopbackRedirect(redirectUri);
        if (authorization == null) {
            call.reject("OAuth authorization URL must use HTTP or HTTPS");
            return;
        }
        if (redirect == null) {
            call.reject("OAuth redirect URI must use http://127.0.0.1:<port>/oauth/callback");
            return;
        }

        getActivity().runOnUiThread(() -> {
            rejectPending("OAuth sign-in was replaced by a newer request");
            expectedRedirect = redirect;
            pendingCall = call;

            WebView webView = new WebView(getActivity());
            webView.setBackgroundColor(Color.WHITE);
            webView.getSettings().setJavaScriptEnabled(true);
            webView.getSettings().setDomStorageEnabled(true);
            webView.getSettings().setLoadWithOverviewMode(true);
            webView.getSettings().setUseWideViewPort(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
            }
            webView.setWebViewClient(new CallbackInterceptingClient());

            dialog = new AlertDialog.Builder(getActivity())
                .setView(webView)
                .create();
            dialog.setOnCancelListener(ignored -> rejectPending("OAuth sign-in was cancelled"));
            dialog.setOnDismissListener(ignored -> dialog = null);
            dialog.show();
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            webView.loadUrl(authorization.toString());
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            dismissDialog();
            rejectPending("OAuth sign-in was cancelled");
            call.resolve();
        });
    }

    private Uri parseHttpUrl(String value) {
        if (value == null) return null;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) && uri.getHost() != null ? uri : null;
    }

    private Uri parseLoopbackRedirect(String value) {
        Uri uri = parseHttpUrl(value);
        if (uri == null || !"http".equalsIgnoreCase(uri.getScheme())) return null;
        if (!"127.0.0.1".equals(uri.getHost()) || uri.getPort() <= 0) return null;
        return "/oauth/callback".equals(uri.getPath()) ? uri : null;
    }

    private boolean matchesRedirect(Uri candidate) {
        return expectedRedirect != null
            && expectedRedirect.getScheme().equalsIgnoreCase(candidate.getScheme())
            && expectedRedirect.getHost().equals(candidate.getHost())
            && expectedRedirect.getPort() == candidate.getPort()
            && expectedRedirect.getPath().equals(candidate.getPath());
    }

    private void resolveCallback(Uri callback) {
        PluginCall call = pendingCall;
        pendingCall = null;
        expectedRedirect = null;
        dismissDialog();
        if (call == null) return;

        JSObject result = new JSObject();
        result.put("url", callback.toString());
        call.resolve(result);
    }

    private void rejectPending(String message) {
        PluginCall call = pendingCall;
        pendingCall = null;
        expectedRedirect = null;
        if (call != null) call.reject(message);
    }

    private void dismissDialog() {
        if (dialog == null) return;
        AlertDialog activeDialog = dialog;
        dialog = null;
        activeDialog.dismiss();
    }

    private class CallbackInterceptingClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri candidate = Uri.parse(url);
            if (!matchesRedirect(candidate)) return false;
            resolveCallback(candidate);
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri candidate = request.getUrl();
            if (!matchesRedirect(candidate)) return false;
            resolveCallback(candidate);
            return true;
        }
    }
}
