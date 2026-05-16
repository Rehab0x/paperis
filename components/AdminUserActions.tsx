"use client";

// 관리자 사용자 상세 페이지의 액션 영역.
//   1. Plan 강제 변경 (free/balanced/pro/byok) + 기간(days) 옵션
//   2. 구독 해지 (active 월구독만)
//   3. 계정 삭제 (2단계 확인)
//
// 본인 계정은 삭제 라우트에서 거부 (lockout 방지). UI에서도 disable.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppMessages } from "@/components/useAppMessages";

type Plan = "free" | "balanced" | "pro" | "byok";

interface Props {
  userId: string;
  userEmail: string | null;
  currentPlan: Plan;
  hasActiveSub: boolean; // 월구독 active 또는 cancelled (해지 가능 대상)
  isSelf: boolean; // 본인 계정이면 삭제 disable
}

export default function AdminUserActions({
  userId,
  userEmail,
  currentPlan,
  hasActiveSub,
  isSelf,
}: Props) {
  const m = useAppMessages();
  const router = useRouter();
  const [plan, setPlan] = useState<Plan>(currentPlan);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function handlePlanApply() {
    setBusy("plan");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, durationDays }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setInfo(m.adminActions.planApplied);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.adminActions.failed);
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    if (!confirm(m.adminActions.cancelConfirm)) return;
    setBusy("cancel");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await extractError(res));
      setInfo(m.adminActions.cancelled);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.adminActions.failed);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (isSelf) return;
    setBusy("delete");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await extractError(res));
      // 삭제 성공 — 목록으로 돌아감
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : m.adminActions.failed);
      setBusy(null);
      setDeleteConfirm(false);
    }
  }

  const planChanged = plan !== currentPlan;
  const showDuration = plan === "balanced" || plan === "pro";

  return (
    <section className="mt-4 rounded-2xl border border-paperis-accent/30 bg-paperis-surface p-5">
      <h2 className="text-sm font-semibold text-paperis-accent">
        {m.adminActions.title}
      </h2>
      <p className="mt-1 text-xs text-paperis-text-3">
        {userEmail ?? userId}
      </p>

      {/* Plan 변경 */}
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          {m.adminActions.planSection}
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["free", "balanced", "pro", "byok"] as Plan[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              className={[
                "rounded-lg border px-3 py-1 text-xs transition",
                plan === p
                  ? "border-paperis-accent bg-paperis-accent-dim/40 text-paperis-accent"
                  : "border-paperis-border text-paperis-text-2 hover:border-paperis-text-3",
              ].join(" ")}
            >
              {p}
            </button>
          ))}
        </div>
        {showDuration ? (
          <label className="mt-3 flex items-center gap-2 text-xs text-paperis-text-2">
            {m.adminActions.duration}
            <input
              type="number"
              min={1}
              max={3650}
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-20 rounded-lg border border-paperis-border bg-paperis-surface px-2 py-1 text-xs"
            />
            {m.adminActions.days}
          </label>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handlePlanApply}
            disabled={!planChanged || busy !== null}
            className="inline-flex h-8 items-center rounded-lg bg-paperis-accent px-3 text-xs font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "plan" ? m.adminActions.applying : m.adminActions.planApply}
          </button>
        </div>
      </div>

      {/* 구독 해지 */}
      {hasActiveSub ? (
        <div className="mt-5 border-t border-paperis-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
            {m.adminActions.cancelSection}
          </h3>
          <p className="mt-1 text-xs text-paperis-text-3">
            {m.adminActions.cancelHint}
          </p>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy !== null}
            className="mt-2 inline-flex h-8 items-center rounded-lg border border-paperis-accent/40 bg-paperis-surface px-3 text-xs font-medium text-paperis-accent transition hover:bg-paperis-accent-dim/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "cancel" ? m.adminActions.cancelling : m.adminActions.cancelButton}
          </button>
        </div>
      ) : null}

      {/* 계정 삭제 */}
      <div className="mt-5 border-t border-paperis-border pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          {m.adminActions.deleteSection}
        </h3>
        <p className="mt-1 text-xs text-paperis-text-3">
          {isSelf ? m.adminActions.deleteSelfBlocked : m.adminActions.deleteHint}
        </p>
        {!deleteConfirm ? (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            disabled={isSelf || busy !== null}
            className="mt-2 inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs text-paperis-text-3 transition hover:border-paperis-accent hover:text-paperis-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {m.adminActions.deleteButton}
          </button>
        ) : (
          <div className="mt-2 space-y-2 rounded-lg border border-paperis-accent/50 bg-paperis-accent-dim/30 p-3">
            <p className="text-xs font-medium text-paperis-accent">
              {m.adminActions.deleteConfirm}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy !== null}
                className="inline-flex h-8 items-center rounded-lg bg-paperis-accent px-3 text-xs font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "delete"
                  ? m.adminActions.deleting
                  : m.adminActions.deleteFinal}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                disabled={busy !== null}
                className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
              >
                {m.adminActions.deleteCancel}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 상태 메시지 */}
      {error ? (
        <div className="mt-4 rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 p-3 text-xs text-paperis-accent">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="mt-4 rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 p-3 text-xs text-paperis-accent">
          {info}
        </div>
      ) : null}
    </section>
  );
}

async function extractError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const obj = JSON.parse(text) as { error?: string };
      if (obj.error) return obj.error;
    } catch {}
    return `요청 실패 (${res.status})`;
  } catch {
    return `요청 실패 (${res.status})`;
  }
}
