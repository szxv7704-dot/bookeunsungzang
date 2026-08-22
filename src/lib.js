import { createClient } from "@supabase/supabase-js";

// 기존 프로젝트의 공개 anon 설정을 폴백으로 유지해 이전 기록을 그대로 불러옵니다.
const LEGACY_URL = "https://whyoeekvnvqtsgqmlywj.supabase.co";
const LEGACY_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoeW9lZWt2bnZxdHNncW1seXdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjM1NDAsImV4cCI6MjEwMjQzOTU0MH0.mYIrGDbzNo_4Rg_lEKU5cI4YJXyuQtDoQYRC5j1M47U";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || LEGACY_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || LEGACY_ANON_KEY;
export const sb = createClient(supabaseUrl, supabaseAnonKey);

export const SPINE_COLORS = ["#244c43", "#6d3e48", "#59633e", "#86513b", "#35475d", "#5b5147", "#8b6a34"];

export function spineColor(text = "") {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 9973;
  return SPINE_COLORS[hash % SPINE_COLORS.length];
}

export function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

export function relativeDays(value) {
  if (!value) return "";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

export function isMissingRelation(error) {
  return error?.code === "42P01" || /does not exist|schema cache/i.test(error?.message || "");
}

export async function callAI(mode, payload) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ mode, payload }),
  });
  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(response.status === 404
      ? "로컬 AI 서버가 연결되지 않았습니다. 개발 서버를 다시 실행해 주세요."
      : "AI 서버의 응답을 읽지 못했습니다.");
  }
  if (!response.ok) throw new Error(result.error || "AI와 연결하지 못했습니다.");
  return result;
}
