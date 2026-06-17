import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/agent";
import { formatAgentResponse } from "@/lib/response-format";
import { recordUnansweredQuestion } from "@/lib/unanswered-tracker";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: string };
    const question = body.question?.trim();

    if (!question) {
      return NextResponse.json(
        { error: "질문이 비어 있습니다." },
        { status: 400 },
      );
    }

    const result = answerQuestion(question);
    void recordUnansweredQuestion(result, question).catch(() => {});

    return NextResponse.json(formatAgentResponse(result), {
      headers: corsHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: "질문 처리 중 오류가 발생했습니다." },
      { status: 500, headers: corsHeaders },
    );
  }
}
