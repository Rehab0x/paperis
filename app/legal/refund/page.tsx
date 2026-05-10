// /legal/refund — 환불 정책. M8 라이브 결제 전 필수 게시.

export const metadata = {
  title: "환불 정책 — Paperis",
};

export default function RefundPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        환불 정책
      </h1>
      <p className="mt-2 text-xs text-zinc-500">시행일: 2026-05-01</p>

      <section className="prose prose-zinc dark:prose-invert mt-8 max-w-none text-sm leading-relaxed">
        <h2>BYOK 1회 결제</h2>
        <p>BYOK 결제(평생 이용 한도 해제) 환불 기준:</p>
        <ul>
          <li>
            <strong>결제 후 7일 이내 + 1회 이상 사용한 경우</strong>: 부분 환불
            불가 (디지털 콘텐츠 사용에 따른 가치 소비)
          </li>
          <li>
            <strong>결제 후 7일 이내 + 사용하지 않은 경우</strong>: 전액 환불
            가능. 고객센터로 문의해 주세요.
          </li>
          <li>
            <strong>결제 후 7일 경과</strong>: 일반적으로 환불 불가. 단,
            서비스의 중대한 하자 또는 회사 측의 책임 있는 사유가 있는 경우
            예외적으로 처리합니다.
          </li>
        </ul>

        <h2>Pro 월 구독</h2>
        <ul>
          <li>
            <strong>최초 결제 후 7일 이내 + 거의 사용하지 않은 경우</strong>:
            전액 환불 가능
          </li>
          <li>
            <strong>해지</strong>: 언제든 헤더 → 계정 → 구독 관리에서 해지
            가능합니다. 다음 결제일에 자동결제가 중단되며, 이미 결제된 당월은
            남은 기간 동안 그대로 이용할 수 있습니다 (일할 환불 X).
          </li>
          <li>
            <strong>자동결제 실패</strong>: 카드 만료·한도 초과 등으로 자동결제
            실패 시 즉시 Pro 권한이 정지되며, 사용자가 카드 정보를 갱신할 때까지
            구독이 보류됩니다 (별도 재결제 필요).
          </li>
        </ul>

        <h2>환불 처리</h2>
        <p>환불 신청 절차:</p>
        <ol>
          <li>고객센터(이메일)로 환불 사유와 결제 내역(orderId)을 첨부해 신청</li>
          <li>회사 검토 후 영업일 기준 3일 이내 답변</li>
          <li>승인 시 결제 카드로 7~14일 이내 환불 처리 (PG사 정책에 따름)</li>
        </ol>

        <h2>고객센터</h2>
        <p>
          이메일: <code>support@paperis.example</code> (M8에서 사업자 정보 등록 후
          갱신 예정)
        </p>

        <h2>주의 사항</h2>
        <p>
          본 서비스는 임상 의사결정 도구가 아닙니다. AI 생성 요약·번역의 정확성을
          100% 보장하지 않으며, 이를 사유로 한 환불은 인정되지 않습니다 (정보
          제공 도구로 안내됨).
        </p>
      </section>
    </main>
  );
}
