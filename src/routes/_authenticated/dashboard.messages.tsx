import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  messages as messagesApi, inquiries as inquiriesApi,
  type ApiMessage, type ApiInquiry,
} from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Send, Search, Loader2, MessageSquare, Building2, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard/messages")({
  head: () => ({ meta: [{ title: "Messages — Nivaas" }] }),
  component: Messages,
});

// ─── Status badge helper ──────────────────────────────────────────────────────
const INQUIRY_STATUS_CLS: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800",
  responded:  "bg-blue-100 text-blue-800",
  scheduled:  "bg-primary/10 text-primary",
  closed:     "bg-muted text-muted-foreground",
};

function InquiryCard({ inq, isOwner }: { inq: ApiInquiry; isOwner: boolean }) {
  return (
    <Card className="p-4 border-border/60 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{inq.property_title}</p>
          <p className="text-xs text-muted-foreground">{inq.city}</p>
          {isOwner ? (
            <p className="text-xs text-muted-foreground mt-1">
              From: <span className="font-medium text-foreground">{inq.customer_name}</span>
              {inq.customer_phone && <> · {inq.customer_phone}</>}
              {inq.customer_email && <> · {inq.customer_email}</>}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Owner: <span className="font-medium text-foreground">{inq.owner_name}</span>
              {inq.owner_phone && <> · {inq.owner_phone}</>}
            </p>
          )}
        </div>
        <Badge className={`shrink-0 text-xs capitalize ${INQUIRY_STATUS_CLS[inq.status] ?? "bg-muted text-muted-foreground"}`}>
          {inq.status}
        </Badge>
      </div>
      {inq.message && (
        <p className="mt-3 text-sm text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border border-border/40">
          "{inq.message}"
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {new Date(inq.created_at).toLocaleDateString("en-IN", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })}
      </p>
    </Card>
  );
}

// ─── Direct Messages panel ────────────────────────────────────────────────────
function DirectMessagesPanel() {
  const { profile }               = useAuth();
  const [threads, setThreads]     = useState<ApiMessage[]>([]);
  const [convo, setConvo]         = useState<ApiMessage[]>([]);
  const [activeThread, setActive] = useState<ApiMessage | null>(null);
  const [text, setText]           = useState("");
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const [search, setSearch]       = useState("");

  useEffect(() => {
    messagesApi.threads()
      .then(t => { setThreads(t); if (t.length > 0) openThread(t[0]); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convo]);

  const openThread = async (thread: ApiMessage) => {
    setActive(thread);
    try {
      const msgs = await messagesApi.conversation(
        thread.other_user_id!,
        thread.property_id ?? undefined,
      );
      setConvo(msgs);
    } catch { setConvo([]); }
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeThread) return;
    setSending(true);
    try {
      const msg = await messagesApi.send({
        receiver_id: activeThread.other_user_id!,
        content: text.trim(),
        property_id: activeThread.property_id ?? undefined,
      });
      setConvo(prev => [...prev, msg]);
      setText("");
    } catch { toast.error("Failed to send message"); }
    finally { setSending(false); }
  };

  const filtered = threads.filter(t =>
    !search || (t.other_user_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="border-border/60 overflow-hidden grid md:grid-cols-[320px_1fr] h-[70vh]">
      {/* Threads panel */}
      <div className="border-r border-border/60 flex flex-col">
        <div className="p-4 border-b border-border/60">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center px-4">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
            </div>
          ) : (
            filtered.map(t => (
              <div key={`${t.other_user_id}-${t.property_id}`}
                onClick={() => openThread(t)}
                className={`flex items-center gap-3 p-4 border-b border-border/60 cursor-pointer hover:bg-secondary/40 ${activeThread?.other_user_id === t.other_user_id ? "bg-secondary/60" : ""}`}>
                <div className="h-10 w-10 rounded-full bg-gradient-primary text-white flex items-center justify-center font-semibold shrink-0">
                  {(t.other_user_name || "U").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">{t.other_user_name || "User"}</p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  {t.property_title && (
                    <p className="text-xs text-primary truncate">{t.property_title}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{t.content}</p>
                </div>
                {!t.is_read && t.receiver_id === profile?.id && (
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat panel */}
      {!activeThread ? (
        <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground p-8">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
          Select a conversation to start chatting
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="h-16 border-b border-border/60 flex items-center gap-3 px-5">
            <div className="h-9 w-9 rounded-full bg-gradient-primary text-white flex items-center justify-center font-semibold">
              {(activeThread.other_user_name || "U")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-sm">{activeThread.other_user_name || "User"}</p>
              {activeThread.property_title && (
                <p className="text-xs text-muted-foreground">{activeThread.property_title}</p>
              )}
            </div>
          </div>

          <div className="flex-1 p-6 space-y-3 overflow-auto">
            {convo.map(msg => (
              <Bubble key={msg.id} mine={msg.sender_id === profile?.id} text={msg.content} />
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-border/60 flex gap-2">
            <Input
              placeholder="Type a message…"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <Button variant="hero" onClick={sendMessage} disabled={sending || !text.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Main Messages component ──────────────────────────────────────────────────
function Messages() {
  const { profile }                   = useAuth();
  const [inquiries, setInquiries]     = useState<ApiInquiry[]>([]);
  const [inqLoading, setInqLoading]   = useState(true);
  const isOwner = profile?.role === "owner" || profile?.role === "admin";

  useEffect(() => {
    inquiriesApi.list()
      .then(data => setInquiries(data))
      .catch(() => {})
      .finally(() => setInqLoading(false));
  }, []);

  const subtitle = isOwner
    ? "Chat with tenants and view inquiry requests"
    : "Chat with owners and track your inquiries";

  return (
    <DashboardShell title="Messages" subtitle={subtitle}>
      <Tabs defaultValue="messages">
        <TabsList className="flex-wrap h-auto mb-4">
          <TabsTrigger value="messages" className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Direct Messages
          </TabsTrigger>
          <TabsTrigger value="inquiries" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {isOwner ? "Received Inquiries" : "Sent Inquiries"}
            {inquiries.filter(i => i.status === "pending").length > 0 && (
              <Badge className="ml-1 bg-primary text-white text-[10px] px-1.5 py-0">
                {inquiries.filter(i => i.status === "pending").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Direct Messages ── */}
        <TabsContent value="messages">
          <DirectMessagesPanel />
        </TabsContent>

        {/* ── Inquiries ── */}
        <TabsContent value="inquiries">
          {inqLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : inquiries.length === 0 ? (
            <Card className="p-12 border-border/60 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-semibold">
                {isOwner ? "No inquiries received yet" : "No inquiries sent yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isOwner
                  ? "When customers send inquiries about your properties, they'll appear here."
                  : "Browse properties and send an inquiry to get started."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Group header counts */}
              <div className="flex gap-3 flex-wrap text-sm text-muted-foreground">
                {Object.entries(
                  inquiries.reduce((acc, i) => {
                    acc[i.status] = (acc[i.status] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([status, count]) => (
                  <span key={status} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${INQUIRY_STATUS_CLS[status] ?? "bg-muted text-muted-foreground"}`}>
                    {status}: {count}
                  </span>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {inquiries.map(inq => (
                  <InquiryCard key={inq.id} inq={inq} isOwner={!!isOwner} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

function Bubble({ mine, text }: { mine: boolean; text: string }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-gradient-primary text-white" : "bg-secondary text-secondary-foreground"}`}>
        {text}
      </div>
    </div>
  );
}
