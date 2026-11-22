package it.bussola.csvaa;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Ogni ora scarica i dati dell'app (dati.json, aggiornato dal lettore del sito CSVAA)
 * e manda le notifiche: nuovi appuntamenti, promemoria la sera prima, nuovi bandi,
 * bandi in scadenza, notizie della settimana. Non serve nessun server né account.
 */
public class ControlloWorker extends Worker {

    private static final String CANALE = "avvisi";
    private static final String NOME_LAVORO = "controllo-orario";
    private static final ZoneId ROMA = ZoneId.of("Europe/Rome");
    private static final int MAX_NOTIFICHE = 6;

    public ControlloWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void pianifica(Context c) {
        Constraints vincoli = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest richiesta = new PeriodicWorkRequest.Builder(ControlloWorker.class, 1, TimeUnit.HOURS)
                .setConstraints(vincoli).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(NOME_LAVORO, ExistingPeriodicWorkPolicy.KEEP, richiesta);
        controllaSubito(c);
    }

    static void controllaSubito(Context c) {
        Constraints vincoli = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        WorkManager.getInstance(c).enqueueUniqueWork("controllo-subito", ExistingWorkPolicy.REPLACE,
                new OneTimeWorkRequest.Builder(ControlloWorker.class).setConstraints(vincoli).build());
    }

    private static class Avviso {
        final String titolo, testo, pagina;
        Avviso(String titolo, String testo, String pagina) { this.titolo = titolo; this.testo = testo; this.pagina = pagina; }
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            JSONObject dati = new JSONObject(scarica(MainActivity.URL_APP + "dati.json?t=" + System.currentTimeMillis()));
            SharedPreferences pref = c.getSharedPreferences("bussola", Context.MODE_PRIVATE);
            Set<String> visti = new HashSet<>(pref.getStringSet("visti", new HashSet<>()));
            Set<String> promemoria = new HashSet<>(pref.getStringSet("promemoria", new HashSet<>()));
            boolean primoGiro = !pref.getBoolean("avviato", false);

            ZonedDateTime adesso = ZonedDateTime.now(ROMA);
            LocalDate oggi = adesso.toLocalDate();
            int ora = adesso.getHour();
            List<Avviso> avvisi = new ArrayList<>();

            JSONArray eventi = dati.optJSONArray("eventi");
            for (int k = 0; eventi != null && k < eventi.length(); k++) {
                JSONObject e = eventi.getJSONObject(k);
                String id = e.optString("id");
                LocalDate giorno = LocalDate.parse(e.optString("data"));
                String oraEv = e.optString("ora");
                String luogo = e.optString("luogo");
                String pagina = "evento/" + Uri.encode(id);
                if (visti.add("ev:" + id) && !giorno.isBefore(oggi)) {
                    avvisi.add(new Avviso("Nuovo appuntamento CSVAA", e.optString("titolo") + "\n"
                            + dataLeggibile(giorno) + (oraEv.isEmpty() ? "" : " ore " + oraEv)
                            + (luogo.isEmpty() ? "" : "\n" + luogo), pagina));
                }
                if (ChronoUnit.DAYS.between(oggi, giorno) == 1 && ora >= 17 && promemoria.add("pr:" + id)) {
                    avvisi.add(new Avviso("Domani: " + e.optString("titolo"),
                            (oraEv.isEmpty() ? "Orario sulla pagina del CSVAA" : "Ore " + oraEv) + (luogo.isEmpty() ? "" : " – " + luogo), pagina));
                }
            }

            JSONArray bandi = dati.optJSONArray("bandi");
            for (int k = 0; bandi != null && k < bandi.length(); k++) {
                JSONObject b = bandi.getJSONObject(k);
                String id = b.optString("id");
                String sc = b.optString("scadenza");
                LocalDate scadenza = sc.isEmpty() ? null : LocalDate.parse(sc);
                String pagina = "bando/" + Uri.encode(id);
                if (visti.add("ba:" + id) && (scadenza == null || !scadenza.isBefore(oggi))) {
                    avvisi.add(new Avviso("Nuovo bando", b.optString("titolo")
                            + (scadenza == null ? "" : "\nScadenza: " + dataLeggibile(scadenza)), pagina));
                }
                if (scadenza != null && ora >= 9) {
                    long mancano = ChronoUnit.DAYS.between(oggi, scadenza);
                    if (mancano == 7 && promemoria.add("pr7:" + id))
                        avvisi.add(new Avviso("Il bando scade tra 7 giorni", b.optString("titolo"), pagina));
                    if (mancano == 1 && promemoria.add("pr1:" + id))
                        avvisi.add(new Avviso("Il bando scade domani", b.optString("titolo"), pagina));
                }
            }

            JSONArray notizie = dati.optJSONArray("notizie");
            for (int k = 0; notizie != null && k < notizie.length(); k++) {
                JSONObject n = notizie.getJSONObject(k);
                LocalDate giorno = LocalDate.parse(n.optString("data"));
                if (visti.add("nw:" + n.optString("id")) && ChronoUnit.DAYS.between(giorno, oggi) <= 7) {
                    avvisi.add(new Avviso("Novità dal CSVAA", n.optString("titolo"), "notizie"));
                }
            }

            if (primoGiro) {
                // Al primo avvio registra quello che c'è già, senza riempire il telefono di notifiche
                notifica(c, 1, "Bussola CSVAA è attiva",
                        "Ti avviseremo qui di nuovi appuntamenti, promemoria e bandi in scadenza.", "home");
            } else {
                int n = 0;
                for (Avviso a : avvisi) {
                    if (n == MAX_NOTIFICHE - 1 && avvisi.size() > MAX_NOTIFICHE) {
                        notifica(c, 100 + n, "Altre novità dal CSVAA",
                                "Ci sono altri " + (avvisi.size() - n) + " aggiornamenti. Apri l'app per vederli.", "home");
                        break;
                    }
                    notifica(c, (a.titolo + a.testo).hashCode(), a.titolo, a.testo, a.pagina);
                    n++;
                }
            }

            pref.edit().putBoolean("avviato", true).putStringSet("visti", visti)
                    .putStringSet("promemoria", promemoria).putLong("ultimoControllo", System.currentTimeMillis()).apply();
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    private static String dataLeggibile(LocalDate d) {
        return d.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN));
    }

    private static String scarica(String indirizzo) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(indirizzo).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(20000);
        con.setRequestProperty("Cache-Control", "no-cache");
        try (InputStream in = con.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int letti;
            while ((letti = in.read(buf)) > 0) out.write(buf, 0, letti);
            return out.toString(StandardCharsets.UTF_8.name());
        } finally {
            con.disconnect();
        }
    }

    private static void creaCanale(Context c) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CANALE, c.getString(R.string.canale_nome), NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription(c.getString(R.string.canale_descrizione));
            c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    private static void notifica(Context c, int id, String titolo, String testo, String pagina) {
        creaCanale(c);
        Intent apri = new Intent(c, MainActivity.class)
                .putExtra(MainActivity.EXTRA_PAGINA, pagina)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, id, apri, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder nb = new NotificationCompat.Builder(c, CANALE)
                .setSmallIcon(R.drawable.ic_notifica)
                .setColor(0xFF1D6FA5)
                .setContentTitle(titolo)
                .setContentText(testo.split("\n")[0])
                .setStyle(new NotificationCompat.BigTextStyle().bigText(testo))
                .setContentIntent(pi)
                .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(c).notify(id, nb.build());
        } catch (SecurityException ignorata) {
            // permesso notifiche negato: niente da fare
        }
    }
}
