package it.bussola.csvaa;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.provider.Settings;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.app.NotificationManagerCompat;

/**
 * Schermata principale: mostra l'app pubblicata su GitHub Pages dentro una WebView.
 * Così ogni miglioria all'app arriva subito, senza reinstallare l'APK.
 */
public class MainActivity extends Activity {

    static final String URL_APP = "https://torielligeo-bot.github.io/bussola-csvaa/";
    static final String EXTRA_PAGINA = "pagina";
    private static final int RICHIESTA_NOTIFICHE = 7;

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.setBackgroundColor(Color.WHITE);

        // Contenitore che lascia libero lo spazio delle barre di sistema (orologio in alto,
        // tasti o barra dei gesti in basso). La WebView da sola non rispetta il padding.
        FrameLayout contenitore = new FrameLayout(this);
        contenitore.setBackgroundColor(Color.WHITE);
        contenitore.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(contenitore);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            contenitore.setOnApplyWindowInsetsListener((View v, WindowInsets insets) -> {
                android.graphics.Insets b = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(b.left, b.top, b.right, b.bottom);
                return WindowInsets.CONSUMED;
            });
            contenitore.requestApplyInsets();
        } else {
            contenitore.setFitsSystemWindows(true);
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " BussolaAndroid/" + BuildConfigVersione.nome(this));

        web.addJavascriptInterface(new Ponte(), "BussolaAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (dellApp(uri)) return false;
                apriFuori(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadData("<html><body style='font-family:sans-serif;padding:24px;color:#1d2733'>"
                            + "<h2>Nessuna connessione</h2><p>Bussola ha bisogno di internet per il primo avvio. "
                            + "Controlla la connessione e riapri l'app.</p>"
                            + "<p><a href='" + URL_APP + "' style='color:#1d6fa5'>Riprova</a></p></body></html>",
                            "text/html; charset=utf-8", "utf-8");
                }
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(indirizzo(getIntent()));

        chiediPermessoNotifiche();
        ControlloWorker.pianifica(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.hasExtra(EXTRA_PAGINA)) web.loadUrl(indirizzo(intent));
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private String indirizzo(Intent intent) {
        String pagina = intent != null ? intent.getStringExtra(EXTRA_PAGINA) : null;
        return pagina != null ? URL_APP + "#" + pagina : URL_APP;
    }

    private static boolean dellApp(Uri uri) {
        return "https".equals(uri.getScheme())
                && "torielligeo-bot.github.io".equals(uri.getHost())
                && uri.getPath() != null && uri.getPath().startsWith("/bussola-csvaa");
    }

    private void apriFuori(Uri uri) {
        try {
            Intent i;
            String schema = uri.getScheme() == null ? "" : uri.getScheme();
            switch (schema) {
                case "mailto": i = new Intent(Intent.ACTION_SENDTO, uri); break;
                case "tel": i = new Intent(Intent.ACTION_DIAL, uri); break;
                case "intent": i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME); break;
                default: i = new Intent(Intent.ACTION_VIEW, uri);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            Toast.makeText(this, "Nessuna app adatta per aprire il collegamento", Toast.LENGTH_SHORT).show();
        }
    }

    private void chiediPermessoNotifiche() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, RICHIESTA_NOTIFICHE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == RICHIESTA_NOTIFICHE) web.evaluateJavascript("window.dispatchEvent(new Event('bussola-notifiche'))", null);
    }

    /** Funzioni che la pagina web può chiamare (window.BussolaAndroid.xxx) */
    class Ponte {
        @JavascriptInterface
        public boolean notificheAttive() {
            return NotificationManagerCompat.from(MainActivity.this).areNotificationsEnabled();
        }

        @JavascriptInterface
        public void apriImpostazioniNotifiche() {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            runOnUiThread(() -> startActivity(i));
        }

        @JavascriptInterface
        public void controllaAdesso() {
            ControlloWorker.controllaSubito(MainActivity.this);
        }

        @JavascriptInterface
        public String versione() {
            return BuildConfigVersione.nome(MainActivity.this);
        }

        /** Apre il calendario del telefono con l'evento già compilato */
        @JavascriptInterface
        public void aggiungiEvento(String titolo, double inizio, double fine, boolean tuttoIlGiorno, String luogo, String descrizione) {
            Intent i = new Intent(Intent.ACTION_INSERT)
                    .setData(CalendarContract.Events.CONTENT_URI)
                    .putExtra(CalendarContract.Events.TITLE, titolo)
                    .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, (long) inizio)
                    .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, (long) fine)
                    .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, tuttoIlGiorno)
                    .putExtra(CalendarContract.Events.EVENT_LOCATION, luogo)
                    .putExtra(CalendarContract.Events.DESCRIPTION, descrizione)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            runOnUiThread(() -> {
                try {
                    startActivity(i);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "Nessuna app calendario trovata", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }
}
