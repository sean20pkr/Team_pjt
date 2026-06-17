'use client';

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-3xl items-center px-6 py-10">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-medium text-blue-800">Supabase 로그인</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-900">
          이메일 매직링크로 로그인
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          현재는 화면 뼈대입니다. 다음 단계에서 Supabase 인증과 연결합니다.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
          }}
          >
            <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-700">이메일</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500"
              />
          </label>

          <button
            type="submit"
            className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            매직링크 보내기
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {email ? (
            <p>입력한 이메일: {email}</p>
          ) : (
            <p>이메일을 입력하면 로그인 준비 상태를 확인할 수 있습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}
