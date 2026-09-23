"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { updateSettingAction, type UpdateSettingResult } from "../../_actions/settings";
import { FormField, INPUT_CLASS, Panel } from "../../_components/ui";

interface Initial {
  sla: { responseMinutes: number; businessStart: string; businessEnd: string; timeZone: string; escalationMinutes: number };
  routing: { premiumThresholdInr: number; groupThresholdPax: number; maxConcurrentDefault: number };
  followup: { ladderHours: number[]; autoLostAfterHours: number };
  pricing: { tolerancePercent: number };
}

export function SettingsForms({ initial }: { initial: Initial }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SettingForm settingKey="sla" title="Response SLA" sub="First reply target and the business hours it is measured in.">
        {(f) => (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Response target (min)" htmlFor="sla-response" error={f.responseMinutes}>
                <input id="sla-response" name="responseMinutes" type="number" min={5} max={1440} defaultValue={initial.sla.responseMinutes} className={INPUT_CLASS} />
              </FormField>
              <FormField label="Escalate after (min)" htmlFor="sla-esc" error={f.escalationMinutes}>
                <input id="sla-esc" name="escalationMinutes" type="number" min={5} max={1440} defaultValue={initial.sla.escalationMinutes} className={INPUT_CLASS} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Business start" htmlFor="sla-start" error={f.businessStart}>
                <input id="sla-start" name="businessStart" type="time" defaultValue={initial.sla.businessStart} className={INPUT_CLASS} />
              </FormField>
              <FormField label="Business end" htmlFor="sla-end" error={f.businessEnd}>
                <input id="sla-end" name="businessEnd" type="time" defaultValue={initial.sla.businessEnd} className={INPUT_CLASS} />
              </FormField>
              <FormField label="Time zone" htmlFor="sla-tz" error={f.timeZone}>
                <input id="sla-tz" name="timeZone" defaultValue={initial.sla.timeZone} className={INPUT_CLASS} />
              </FormField>
            </div>
          </>
        )}
      </SettingForm>

      <SettingForm settingKey="routing" title="Lead routing" sub="Thresholds that decide which agents a new inquiry goes to (§17 §7.3).">
        {(f) => (
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Premium from (₹)" htmlFor="rt-premium" hint="Indicative total" error={f.premiumThresholdInr}>
              <input id="rt-premium" name="premiumThresholdInr" type="number" min={0} defaultValue={initial.routing.premiumThresholdInr} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Group from (pax)" htmlFor="rt-group" error={f.groupThresholdPax}>
              <input id="rt-group" name="groupThresholdPax" type="number" min={1} defaultValue={initial.routing.groupThresholdPax} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Default max load" htmlFor="rt-max" hint="Per agent" error={f.maxConcurrentDefault}>
              <input id="rt-max" name="maxConcurrentDefault" type="number" min={1} max={100} defaultValue={initial.routing.maxConcurrentDefault} className={INPUT_CLASS} />
            </FormField>
          </div>
        )}
      </SettingForm>

      <SettingForm settingKey="followup" title="Follow-up ladder" sub="Hours after the last contact at which a follow-up is due, then auto-lost.">
        {(f) => (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ladder (hours)" htmlFor="fu-ladder" hint="Comma-separated, 1–6 rungs, e.g. 2, 24, 72" error={f.ladderHours ?? f["ladderHours.0"]}>
              <input id="fu-ladder" name="ladderHours" defaultValue={initial.followup.ladderHours.join(", ")} className={INPUT_CLASS} />
            </FormField>
            <FormField label="Auto-lost after (hours)" htmlFor="fu-lost" hint='Marks "no response"' error={f.autoLostAfterHours}>
              <input id="fu-lost" name="autoLostAfterHours" type="number" min={1} step="any" defaultValue={initial.followup.autoLostAfterHours} className={INPUT_CLASS} />
            </FormField>
          </div>
        )}
      </SettingForm>

      <SettingForm settingKey="pricing" title="Price tolerance" sub="Confirmed price above indicative by more than this needs an explanation and customer re-consent (§17 Q4).">
        {(f) => (
          <FormField label="Tolerance (%)" htmlFor="pr-tol" error={f.tolerancePercent}>
            <input id="pr-tol" name="tolerancePercent" type="number" min={0} max={100} step="any" defaultValue={initial.pricing.tolerancePercent} className={`${INPUT_CLASS} max-w-40`} />
          </FormField>
        )}
      </SettingForm>
    </div>
  );
}

function SettingForm({
  settingKey,
  title,
  sub,
  children,
}: {
  settingKey: "sla" | "routing" | "followup" | "pricing";
  title: string;
  sub: string;
  children: (fieldErrors: Record<string, string>) => ReactNode;
}) {
  const [state, action, pending] = useActionState<UpdateSettingResult | null, FormData>(updateSettingAction, null);
  const fields = state && !state.ok ? state.fields ?? {} : {};
  return (
    <Panel title={title} sub={sub}>
      <form action={action} className="space-y-4">
        <input type="hidden" name="key" value={settingKey} />
        {state && !state.ok && (
          <Alert tone="danger" title={state.message}>
            {state.recovery}
          </Alert>
        )}
        {state?.ok && (
          <Alert tone="success" title="Saved">
            Live within a minute.
          </Alert>
        )}
        {children(fields)}
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" loading={pending} loadingLabel="Saving…">
            Save {title.toLowerCase()}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
