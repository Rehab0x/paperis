// /legal/privacy — 개인정보처리방침. M8 라이브 결제 전 필수 게시.
// 사업자등록 후 사업자명·DPO 연락처 등은 사용자가 채워야 함.

export const metadata = {
  title: "개인정보처리방침 — Paperis",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <h1 className="font-serif text-3xl font-medium tracking-tight text-paperis-text">
        개인정보처리방침
      </h1>
      <p className="mt-2 text-xs text-paperis-text-3">
        시행일: 2026-05-01 · 최근 갱신: 2026-05-11
      </p>

      <section className="prose prose-zinc dark:prose-invert mt-8 max-w-none text-sm leading-relaxed">
        <h2>1. 수집하는 개인정보 항목</h2>
        <ul>
          <li>
            <strong>회원가입 시 (Google OAuth)</strong>: 이메일, 이름, 프로필
            이미지 URL
          </li>
          <li>
            <strong>온보딩 시</strong>: 휴대폰 번호, 약관 동의 일시, 마케팅 수신
            동의 여부
          </li>
          <li>
            <strong>결제 시</strong>: 결제 카드 식별번호 일부(예: 카드 끝 4자리),
            결제 일시, 결제 금액. 카드 전체 번호·CVC·유효기간은 회사가 보관하지
            않습니다 — Toss Payments가 PCI DSS 인증 환경에서 직접 처리합니다.
          </li>
          <li>
            <strong>서비스 이용 중 자동 수집</strong>: 익명 ID(localStorage UUID),
            저장한 임상과·저널 prefs, 사용량 카운터, IP 주소(접속 로그)
          </li>
        </ul>

        <h2>2. 개인정보 수집 및 이용 목적</h2>
        <ul>
          <li>회원 식별 및 서비스 제공</li>
          <li>유료 서비스 결제 처리 및 영수증 발행</li>
          <li>이용 한도 카운팅 및 부정이용 방지</li>
          <li>서비스 개선을 위한 통계 분석 (개인 식별 불가능한 형태)</li>
          <li>(동의한 회원에 한해) 마케팅·이벤트 안내 메일 발송</li>
        </ul>

        <h2>3. 개인정보 보유 및 이용 기간</h2>
        <p>
          회원 탈퇴 시 즉시 파기합니다. 단, 다음의 경우 관련 법령에 따라 일정 기간
          보관합니다.
        </p>
        <ul>
          <li>전자상거래법: 결제·환불 기록 5년, 표시·광고 기록 6개월</li>
          <li>국세기본법: 거래 증빙서류 5년</li>
          <li>통신비밀보호법: 접속 로그 3개월</li>
        </ul>

        <h2>4. 개인정보 제3자 제공</h2>
        <p>
          회사는 다음의 목적에 한해 이용자의 동의를 받아 개인정보를 제3자에게
          제공합니다.
        </p>
        <ul>
          <li>
            <strong>Toss Payments</strong>: 결제 처리 목적으로 이름, 이메일,
            휴대폰 번호 제공. 보유 기간은 Toss Payments의 정책에 따름.
          </li>
        </ul>
        <p>그 외 법령에 의하거나 수사기관의 요청이 있는 경우 외에는 제공하지 않습니다.</p>

        <h2>5. 개인정보 처리 위탁</h2>
        <ul>
          <li>
            <strong>Vercel</strong> (호스팅, 미국): 서비스 제공을 위한 인프라
          </li>
          <li>
            <strong>Neon</strong> (DB, 미국): 사용자 prefs·구독 정보 저장
          </li>
          <li>
            <strong>Upstash</strong> (캐시, 미국): 트렌드/호 분석 결과 캐시
          </li>
          <li>
            <strong>Google Cloud</strong> (Gemini AI, 미국): 검색식·요약·트렌드
            분석. 사용자 abstract 텍스트가 분석 목적으로 전송되며 Google 정책에
            따라 처리됩니다.
          </li>
        </ul>

        <h2>6. 이용자의 권리</h2>
        <p>
          이용자는 언제든지 자신의 개인정보를 조회·수정·삭제·처리정지 요청할 수
          있습니다. 회원 탈퇴는 헤더 우측 계정 메뉴를 통해 가능하며, 즉시 모든
          개인정보가 파기됩니다 (위 보유 기간 예외 제외).
        </p>

        <h2>7. 쿠키 및 추적 기술</h2>
        <p>
          회사는 서비스 제공에 필요한 최소한의 쿠키를 사용합니다 (세션 유지, 로그인
          상태 유지). 광고·추적 목적의 제3자 쿠키는 사용하지 않습니다. localStorage는
          이용자의 임상과·저널 prefs와 라이브러리 트랙 메타를 저장하는 데 사용되며,
          서버로 전송되지 않습니다 (로그인 시에만 디바이스 동기화 목적으로 DB 저장).
        </p>

        <h2>8. 개인정보 보호책임자</h2>
        <p>
          이메일: <code>privacy@paperis.example</code> (M8에서 사업자 정보 등록 후
          갱신 예정)
        </p>

        <h2>9. 변경 고지</h2>
        <p>
          본 방침이 변경될 경우 시행 7일 전에 본 페이지를 통해 공지하며, 중요한
          변경 사항은 이메일로도 안내합니다.
        </p>
      </section>
    </main>
  );
}
