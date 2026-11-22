package it.bussola.csvaa;

import android.content.Context;
import android.content.pm.PackageManager;

final class BuildConfigVersione {
    private BuildConfigVersione() {}

    static String nome(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "?";
        }
    }
}
