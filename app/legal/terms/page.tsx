// /legal/terms — 서비스 이용약관.
// M8 사업자등록 후 사업자명·소재지·연락처는 사용자가 채워야 함. 현재 placeholder.

export const metadata = {
  title: "이용약관 — Paperis",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        이용약관
      </h1>
      <p className="mt-2 text-xs text-zinc-500">
        시행일: 2026-05-01 · 최근 갱신: 2026-05-11 (sandbox 단계)
      </p>

      <section className="prose prose-zinc dark:prose-invert mt-8 max-w-none text-sm leading-relaxed">
        <h2>제1조 (목적)</h2>
        <p>
          이 약관은 Paperis(이하 &quot;회사&quot;)가 제공하는 의학 논문 검색·요약·청취
          서비스(이하 &quot;서비스&quot;)의 이용 조건과 절차, 회사와 이용자의 권리·의무
          및 책임 사항을 규정함을 목적으로 합니다.
        </p>

        <h2>제2조 (정의)</h2>
        <ul>
          <li>
            <strong>&quot;이용자&quot;</strong>란 본 약관에 따라 회사가 제공하는 서비스를
            이용하는 회원 및 비회원을 말합니다.
          </li>
          <li>
            <strong>&quot;회원&quot;</strong>이란 Google OAuth 등을 통해 로그인하고
            온보딩(휴대폰·약관 동의)을 완료한 이용자를 말합니다.
          </li>
          <li>
            <strong>&quot;비로그인 이용자&quot;</strong>란 로그인 없이 익명 ID
            기반으로 무료 한도 내에서 서비스를 이용하는 이용자를 말합니다.
          </li>
          <li>
            <strong>&quot;유료 서비스&quot;</strong>란 BYOK 1회 결제 또는 Pro 월
            구독을 통해 이용 한도가 해제된 서비스를 말합니다.
          </li>
        </ul>

        <h2>제3조 (서비스의 내용)</h2>
        <p>
          회사는 다음 각호의 서비스를 제공합니다.
        </p>
        <ol>
          <li>PubMed 자연어 검색 및 미니/긴 요약</li>
          <li>임상과별 저널 큐레이션 (호 탐색·주제 탐색·트렌드 분석)</li>
          <li>풀텍스트 자동 추출 (Open Access 한정) 및 AI 요약</li>
          <li>TTS 변환을 통한 음성 청취 및 IndexedDB 라이브러리 보관</li>
          <li>기타 회사가 정하는 부가 서비스</li>
        </ol>

        <h2>제4조 (이용 한도)</h2>
        <p>
          비로그인 및 Free 회원은 월별 다음 한도가 적용됩니다.
        </p>
        <ul>
          <li>저널 큐레이션 분석: 월 3회</li>
          <li>TTS 변환: 월 5편</li>
          <li>풀텍스트 요약: 월 3편</li>
        </ul>
        <p>
          한도는 한국 표준시(KST) 매월 1일 0시에 자동 초기화됩니다. 이용자가 본인의
          API 키(GEMINI_API_KEY 등)를 직접 입력한 경우 또는 BYOK·Pro 결제를 완료한
          경우 한도 없이 이용할 수 있습니다.
        </p>

        <h2>제5조 (유료 서비스 결제)</h2>
        <p>
          유료 서비스는 Toss Payments를 통해 결제됩니다. 결제 정보(카드 정보 등)는
          회사가 직접 보관하지 않으며, 결제 대행사에서 안전하게 처리됩니다. 자세한
          내용은 <a href="/legal/privacy">개인정보처리방침</a>을 참고해 주세요.
        </p>

        <h2>제6조 (환불)</h2>
        <p>
          유료 서비스의 환불 정책은 별도 페이지의{" "}
          <a href="/legal/refund">환불 정책</a>을 따릅니다.
        </p>

        <h2>제7조 (서비스의 제한 및 중단)</h2>
        <p>
          회사는 다음 각호의 사유 발생 시 서비스 제공을 일시 중단할 수 있습니다.
        </p>
        <ol>
          <li>시스템 정기 점검, 증설, 교체 등 운영상 필요한 경우</li>
          <li>천재지변 또는 이에 준하는 불가항력으로 서비스 제공이 불가능한 경우</li>
          <li>외부 API(PubMed, OpenAlex, Gemini 등) 장애로 인한 일시적 제한</li>
        </ol>

        <h2>제8조 (저작권 및 책임의 한계)</h2>
        <p>
          본 서비스는 학술 정보 탐색·요약 도구로, 임상 의사결정 도구가 아닙니다. AI
          생성 요약·번역의 정확성을 100% 보장하지 않으며, 이용자는 원문(논문 본문)을
          기준으로 판단해야 합니다. 회사는 이용자의 임상 결정으로 인한 결과에 책임을
          지지 않습니다.
        </p>
        <p>
          유료 논문의 본문은 무단으로 수집되지 않으며, 이용자가 합법적으로 보유한
          PDF만 업로드 슬롯에서 추출됩니다.
        </p>

        <h2>제9조 (분쟁 해결)</h2>
        <p>
          서비스 이용으로 발생한 분쟁은 대한민국 법령에 따라 해결합니다. 관할 법원은
          민사소송법에 따른 회사 소재지 관할 법원으로 합니다.
        </p>

        <h2>부칙</h2>
        <p>
          이 약관은 2026년 5월 1일부터 시행됩니다. 사업자 등록 정보 등 라이브 결제
          단계에서 추가될 사항은 별도 갱신됩니다 (M8).
        </p>
      </section>
    </main>
  );
}
