import UIKit
import AVFoundation
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Kesi is a game with voices: by default it plays even with the ring/silent switch on, and mixes
        // with whatever the player is already listening to. Settings → "Play sound when the phone is on
        // silent" switches this to .ambient through AudioSessionPlugin below.
        AudioSessionPlugin.apply(playback: true)
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // After a call, Siri or an alarm the session can be left inactive: turn it back on.
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

// The app's web view controller: the same as Capacitor's, plus Kesi's one local plugin.
// Main.storyboard points at this class (customModule "App").
class KesiViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AudioSessionPlugin())
    }
}

// JS: Capacitor.registerPlugin('AudioSession').set({ playback: true | false })   (www/engine/native.js)
// Events: 'resume' after an interruption ends, 'route' when headphones or Bluetooth connect or disconnect.
@objc(AudioSessionPlugin)
public class AudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudioSessionPlugin"
    public let jsName = "AudioSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    static func apply(playback: Bool) {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(playback ? .playback : .ambient, mode: .default, options: [.mixWithOthers])
            try s.setActive(true)
        } catch {
            NSLog("Kesi audio session: \(error.localizedDescription)")
        }
    }

    override public func load() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
            try? AVAudioSession.sharedInstance().setActive(true)
            self?.notifyListeners("resume", data: [:])
        }
        nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            try? AVAudioSession.sharedInstance().setActive(true)
            self?.notifyListeners("route", data: [:])
        }
        nc.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            AudioSessionPlugin.apply(playback: true)
            self?.notifyListeners("resume", data: [:])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let playback = call.getBool("playback") ?? true
        DispatchQueue.main.async {
            AudioSessionPlugin.apply(playback: playback)
            call.resolve(["category": playback ? "playback" : "ambient"])
        }
    }
}
