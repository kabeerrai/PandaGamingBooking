import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { callApi, getAppsScriptUrl, getLastApiResponse, setAppsScriptUrl } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, ErrorBanner } from "@/components/ui-kit";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/admin/settings")({
  component: SettingsPage,
});

type Setting = { setting_name: string; setting_value: string };

function SettingsPage() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(getAppsScriptUrl() ?? ""); }, []);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => callApi<{ success: true; data: Setting[] }>("getSettings"),
    initialData: () => getLastApiResponse<{ success: true; data: Setting[] }>("getSettings"),
    retry: false,
    enabled: !!getAppsScriptUrl(),
  });

  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (settings.data?.data) {
      const map: Record<string, string> = {};
      settings.data.data.forEach((s) => { map[s.setting_name] = s.setting_value; });
      setValues(map);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => callApi("updateSettings", {
      settings: Object.entries(values).map(([setting_name, setting_value]) => ({ setting_name, setting_value })),
    }),
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
  });

  function saveUrl() {
    setAppsScriptUrl(url.trim());
    toast.success("Apps Script URL saved");
    qc.invalidateQueries();
  }

  const knownFields = [
    { key: "business_name", label: "Business name" },
    { key: "opening_time", label: "Opening time (HH:mm)" },
    { key: "closing_time", label: "Closing time (HH:mm)" },
    { key: "booking_slot_interval", label: "Slot interval (minutes)" },
    { key: "currency", label: "Currency" },
    { key: "default_booking_status", label: "Default booking status" },
    { key: "member_discount_per_hour", label: "Member discount per hour (Rs)" },
    { key: "auto_delete_completed_hours", label: "Auto-delete completed bookings after (hours)" },
  ];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Connect Google Sheets and configure business preferences." />

      <Card className="mb-4">
        <h2 className="font-semibold mb-2">Google Apps Script Web App URL</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Deploy your Apps Script as a Web App (Anyone can access), then paste the URL here. Stored in your browser only.
        </p>
        <Field label="Web App URL">
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
        </Field>
        <div className="mt-3 flex gap-2">
          <Btn onClick={saveUrl} disabled={!url.trim()}>Save URL</Btn>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-4">Business Settings</h2>
        <ErrorBanner error={settings.error} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {knownFields.map((f) => (
            <Field key={f.key} label={f.label}>
              <input
                className={inputCls}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <ErrorBanner error={save.error} />
        <div className="mt-4">
          <Btn onClick={() => save.mutate()} disabled={save.isPending || !getAppsScriptUrl()}>
            {save.isPending ? "Saving…" : "Save Settings"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
