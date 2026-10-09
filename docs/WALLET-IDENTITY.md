# Wallet identity: why Phantom asks to "Connect" before every signature

When Nod asks Phantom to sign, Phantom first shows a **Connect** screen, then the signing prompt. This is Phantom's policy for apps whose identity it cannot verify, not a bug in Nod's flow.

## What is happening

Nod sends Phantom an `identity` (name, `uri`, `icon`). The Mobile Wallet Adapter 2.0 spec says a wallet should only re-authorize silently when it has **verified** that identity, and that if it can't, it should refuse and make the app connect again. Phantom's log says exactly that:

```
Declining sol_mwa_reauthorize: dApp identity is not verified (mwaIdentityVerified !== true)
```

On Android, the spec's way to verify a native app is **Digital Asset Links**: the domain in `identity.uri` publishes `/.well-known/assetlinks.json` naming the app's package and signing-certificate fingerprint, and the wallet checks that the calling app matches. Nod's `uri` is a GitHub repository, which can't publish that file, so verification cannot succeed.

Source: [MWA 2.0 specification, "Dapp identity verification" and `authorize`](https://solana-mobile.github.io/mobile-wallet-adapter/spec/spec.html).

## The fix (needs your product website)

1. Pick the site, for example `https://nod.example.com`.
2. Serve this at `https://nod.example.com/.well-known/assetlinks.json`, over HTTPS, as `application/json`, with no redirects:

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "app.nod.mobile",
       "sha256_cert_fingerprints": [
         "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"
       ]
     }
   }]
   ```

   That fingerprint is the **debug** key that signs the development build today. A release APK is signed with your release key, so add **its** SHA-256 too (`keytool -list -v -keystore <release.keystore>`). The list can hold both.
3. Set `uri` in `app/src/solana/mwa.ts` to the site. Serve `favicon.ico` at its root and keep `icon: "favicon.ico"`; this also makes the icon appear.
4. The spec also says apps declare **App Links** in their manifest. If Phantom still reports "not verified" after steps 1-3, add an `autoVerify` intent filter for the site's host in `app.config.ts` and rebuild.
5. Connect again and check Phantom's log. It should no longer print `dApp identity is not verified`, and signing should show only the signing prompt.

## What I could not confirm

I verified the symptom (Phantom's log line) and the spec's rules. I have **not** confirmed that Phantom's check is exactly the Digital Asset Links flow above, or whether step 4 is required for it; that needs a real domain to test against.

## Until then

Two Phantom screens per signing is expected for Nod. The first connection after a disconnect always shows Connect.
