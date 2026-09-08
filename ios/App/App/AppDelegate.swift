import UIKit
import Capacitor
import WebKit

class RHermesBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(OAuthWebViewPlugin())
    }
}

@objc(OAuthWebViewPlugin)
class OAuthWebViewPlugin: CAPPlugin, CAPBridgedPlugin, WKNavigationDelegate {
    let identifier = "OAuthWebViewPlugin"
    let jsName = "OAuthWebView"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]

    private var expectedRedirect: URL?
    private var pendingCall: CAPPluginCall?
    private weak var presentedController: UIViewController?

    @objc func open(_ call: CAPPluginCall) {
        guard
            let authorizeString = call.getString("authorizeUrl"),
            let authorizeURL = URL(string: authorizeString),
            ["http", "https"].contains(authorizeURL.scheme?.lowercased() ?? ""),
            let redirectString = call.getString("redirectUri"),
            let redirectURL = validLoopbackRedirect(redirectString)
        else {
            call.reject("OAuth requires an HTTP authorization URL and http://127.0.0.1:<port>/oauth/callback redirect URI")
            return
        }

        rejectPending("OAuth sign-in was replaced by a newer request")
        expectedRedirect = redirectURL
        pendingCall = call

        DispatchQueue.main.async { [weak self] in
            guard let self, let host = self.bridge?.viewController else {
                self?.rejectPending("Unable to present OAuth sign-in")
                return
            }

            let controller = UIViewController()
            controller.view.backgroundColor = .systemBackground

            let webView = WKWebView(frame: .zero)
            webView.navigationDelegate = self
            webView.translatesAutoresizingMaskIntoConstraints = false
            webView.configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

            let closeButton = UIButton(type: .system)
            closeButton.setTitle("Cancel", for: .normal)
            closeButton.translatesAutoresizingMaskIntoConstraints = false
            closeButton.addAction(UIAction { [weak self] _ in
                self?.dismissAndReject("OAuth sign-in was cancelled")
            }, for: .touchUpInside)

            controller.view.addSubview(closeButton)
            controller.view.addSubview(webView)
            NSLayoutConstraint.activate([
                closeButton.leadingAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
                closeButton.topAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.topAnchor, constant: 8),
                closeButton.heightAnchor.constraint(equalToConstant: 36),
                webView.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor),
                webView.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor),
                webView.topAnchor.constraint(equalTo: closeButton.bottomAnchor, constant: 8),
                webView.bottomAnchor.constraint(equalTo: controller.view.bottomAnchor)
            ])

            controller.modalPresentationStyle = .fullScreen
            self.presentedController = controller
            host.present(controller, animated: true) {
                webView.load(URLRequest(url: authorizeURL))
            }
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.dismissAndReject("OAuth sign-in was cancelled")
            call.resolve()
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let callback = navigationAction.request.url, matchesRedirect(callback) else {
            decisionHandler(.allow)
            return
        }

        decisionHandler(.cancel)
        resolveCallback(callback)
    }

    private func validLoopbackRedirect(_ value: String) -> URL? {
        guard
            let url = URL(string: value),
            url.scheme?.lowercased() == "http",
            url.host == "127.0.0.1",
            url.port != nil,
            url.path == "/oauth/callback"
        else {
            return nil
        }
        return url
    }

    private func matchesRedirect(_ callback: URL) -> Bool {
        guard let expected = expectedRedirect else { return false }
        return callback.scheme?.lowercased() == expected.scheme?.lowercased()
            && callback.host == expected.host
            && callback.port == expected.port
            && callback.path == expected.path
    }

    private func resolveCallback(_ callback: URL) {
        let call = pendingCall
        pendingCall = nil
        expectedRedirect = nil
        dismissPresented()
        call?.resolve(["url": callback.absoluteString])
    }

    private func dismissAndReject(_ message: String) {
        let call = pendingCall
        pendingCall = nil
        expectedRedirect = nil
        dismissPresented()
        call?.reject(message)
    }

    private func rejectPending(_ message: String) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        expectedRedirect = nil
        dismissPresented()
        call.reject(message)
    }

    private func dismissPresented() {
        guard let controller = presentedController else { return }
        presentedController = nil
        controller.dismiss(animated: true)
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }


    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {

        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
