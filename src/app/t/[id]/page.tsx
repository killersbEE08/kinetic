import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TEMPLATES, getTemplate } from "@/lib/deck/templates";
import { TemplateViewer } from "@/components/marketing/TemplateViewer";

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const t = getTemplate((await params).id);
  return t ? { title: t.name, description: t.summary } : {};
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getTemplate(id)) notFound();
  return <TemplateViewer id={id} />;
}
