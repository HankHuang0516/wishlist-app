import { useEffect } from "react";
import { ArrowRight, ExternalLink, MapPinned, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { partnerLandingText as pt } from "../lib/partnerLandingCopy";

const neededFields = [
    "可追蹤的商品 ID 與原始商品連結",
    "商品名稱、實際交易方式與明示價格",
    "可展示的原圖／縮圖及其使用授權",
    "商品實際所在縣市／行政區／門市、最後確認在售時間與失效時間",
    "售出、下架或撤回時的更新方式",
] as const;

export default function PartnerPage() {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = pt("供給合作｜Wishlist.ai");
        return () => { document.title = previousTitle; };
    }, []);

    return (
        <div className="mx-auto max-w-5xl space-y-12 pb-12 text-slate-800">
            <section className="overflow-hidden rounded-[2rem] border border-rose-100 bg-gradient-to-br from-rose-50 via-white to-amber-50 px-6 py-12 shadow-sm sm:px-12 sm:py-16">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/90 px-4 py-2 text-sm font-semibold text-rose-700">
                    <MapPinned className="h-4 w-4" aria-hidden="true" /> {pt("全台二手商品合作招募，先雙北小量試點")} </div>
                <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl"> {pt("讓好物，遇見正在尋找它的人。")} </h1>
                <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600"> {pt("Wishlist.ai 結合願望清單與附近商品探索，邀請二手店、寄賣夥伴和公共拍賣單位， 一起測試有來源、可更新、能導回原站的商品曝光方式。")} </p>
                <div className="mt-8 flex flex-wrap gap-3">
                    <a href="#cooperation" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-medium text-white transition hover:bg-slate-700"> {pt("查看合作方式")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                    <Link to="/partners/inquiry" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700 transition hover:border-slate-400"> {pt("聯絡 Wishlist.ai")} </Link>
                </div>
                <p className="mt-6 text-sm leading-6 text-slate-500"> {pt("此頁是合作邀請，不表示任何來源已授權、商品已匯入，或 Wishlist.ai 為外站商品的賣家。")} </p>
            </section>

            <section aria-label={pt("合作原則")} className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <Sparkles className="h-7 w-7 text-rose-600" aria-hidden="true" />
                    <h2 className="mt-4 text-xl font-semibold">{pt("讓需求找到供給")}</h2>
                    <p className="mt-3 leading-7 text-slate-600">{pt("讓願望與商品資訊有機會相互比對；試點不保證流量、成交或特定排名。")}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <ExternalLink className="h-7 w-7 text-rose-600" aria-hidden="true" />
                    <h2 className="mt-4 text-xl font-semibold">{pt("交易方式由來源決定")}</h2>
                    <p className="mt-3 leading-7 text-slate-600">{pt("外站商品標明出處並導回原頁；賣家也可自行在 Wishlist.ai 刊登。競標底價不會偽裝成固定售價。")}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <ShieldCheck className="h-7 w-7 text-rose-600" aria-hidden="true" />
                    <h2 className="mt-4 text-xl font-semibold">{pt("授權與撤回優先")}</h2>
                    <p className="mt-3 leading-7 text-slate-600">{pt("先確認商品、照片與文字的使用範圍；售出、失效或撤回時停止展示，不擅自轉載私人資訊。")}</p>
                </div>
            </section>

            <section id="cooperation" className="grid gap-10 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:grid-cols-2">
                <div>
                    <p className="text-sm font-semibold tracking-widest text-rose-700">{pt("合作流程")}</p>
                    <h2 className="mt-3 text-3xl font-semibold text-slate-900">{pt("先小量驗證，再決定是否擴大")}</h2>
                    <ol className="mt-7 space-y-5 text-slate-600">
                        <li><strong className="text-slate-900">{pt("01 確認權利與展示方式。")}</strong> {pt("共同核對可用的商品文字、圖片、標示出處和 AI 處理範圍。")}</li>
                        <li><strong className="text-slate-900">{pt("02 提供少量在售樣本。")}</strong> {pt("先以可核對的單件商品和更新訊號測試，不批量複製整站。")}</li>
                        <li><strong className="text-slate-900">{pt("03 私人預檢與審核。")}</strong> {pt("核對價格、行政區、時效及撤下方式後，才討論是否對外顯示。")}</li>
                    </ol>
                </div>
                <div className="rounded-2xl bg-slate-50 p-6 sm:p-8">
                    <h3 className="text-xl font-semibold text-slate-900">{pt("一件商品需要哪些資料？")}</h3>
                    <ul className="mt-5 space-y-4 text-slate-700">
                        {neededFields.map(field => <li key={field} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-500" />{pt(field)}</li>)}
                    </ul>
                    <p className="mt-6 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-500"> {pt("如為競標，請另提供起標價、目前出價、結標時間與狀態；我們會先確認是否適合以「外站競標」呈現，不套用一般固定售價刊登。")} </p>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-900 p-7 text-white sm:p-10">
                <h2 className="text-2xl font-semibold">{pt("歡迎先討論一小批商品")}</h2>
                <p className="mt-3 max-w-2xl leading-7 text-slate-300">{pt("請提供來源名稱、負責窗口、3–10 件真實在售商品範例，以及可使用的圖文與更新方式。試點前會先確認權利與作業範圍，不需要提供賣場密碼。")}</p>
                <Link to="/partners/inquiry" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-medium text-slate-900 transition hover:bg-rose-50"> {pt("提出合作意向")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <div className="mt-4 space-y-2 break-words text-sm"><p>Wishlist.AI 的 Hank</p><div className="flex flex-wrap gap-4"><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="https://eclawbot.com/c/pe3vqm" target="_blank" rel="noopener noreferrer">{pt("EClaw 合作名片")}</a><a className="inline-flex min-h-11 items-center underline underline-offset-4" href="mailto:hankhuang0516@gmail.com">hankhuang0516@gmail.com</a></div></div>
            </section>
        </div>
    );
}
