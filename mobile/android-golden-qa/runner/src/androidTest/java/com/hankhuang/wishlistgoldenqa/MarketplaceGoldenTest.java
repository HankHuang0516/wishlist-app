package com.hankhuang.wishlistgoldenqa;

import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.*;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.Assert.*;

/** Separate, bounded regression suite; never a generic remote-control service.
 * Exercises the real statically bundled isolated QA app, not a test UI clone. */
@RunWith(AndroidJUnit4.class)
public class MarketplaceGoldenTest {
    private UiDevice device;
    private String target, phase, photoName, stage = "setup";
    private File evidence;
    private boolean loggedIn;
    private boolean credentialsEntered;

    private void checkpoint(String value) {
        stage = value;
        Bundle status = new Bundle(); status.putString("goldenStage", value);
        InstrumentationRegistry.getInstrumentation().sendStatus(2, status);
    }
    private boolean has(String label) { return device.hasObject(By.desc(label)) || device.hasObject(By.text(label)); }
    private UiObject2 node(String label) {
        UiObject2 result = device.findObject(By.desc(label));
        return result != null ? result : device.findObject(By.text(label));
    }
    private UiObject2 await(String label) {
        long end = SystemClock.elapsedRealtime() + 25000;
        while (SystemClock.elapsedRealtime() < end) {
            UiObject2 found = node(label); if (found != null) return found;
            SystemClock.sleep(150);
        }
        throw new AssertionError("Missing control at " + stage);
    }
    private void foreground() { assertEquals("Only the exact isolated app may receive input", target, device.getCurrentPackageName()); }
    private void click(String label) {
        Rect prior=null;int stable=0;long end=SystemClock.elapsedRealtime()+10000;
        while(SystemClock.elapsedRealtime()<end){
            foreground();UiObject2 found=await(label);
            for(int depth=0;!found.isClickable()&&depth<5;depth++){
                found=found.getParent();assertNotNull("Expected actionable ancestor at "+stage,found);
            }
            assertTrue("Expected clickable control at "+stage,found.isClickable());
            assertTrue("Expected enabled control at "+stage,found.isEnabled());
            Rect bounds=new Rect(found.getVisibleBounds());
            stable=!bounds.isEmpty()&&bounds.equals(prior)?stable+1:0;prior=bounds;
            // Scroll/fling can keep a CSS/accessibility-visible control moving.
            // Wait for its actual native bounds; never retry a submitted action.
            if(stable>=3){found.click();device.waitForIdle(1500);return;}
            SystemClock.sleep(100);
        }
        throw new AssertionError("Unstable click target at "+stage);
    }
    private void reveal(String label) throws Exception {
        for (int attempt=0; attempt<10 && !has(label); attempt++) {
            foreground();
            UiScrollable view = new UiScrollable(new UiSelector().scrollable(true));
            assertTrue("Expected scroll container at " + stage, view.exists());
            view.scrollForward(35); device.waitForIdle(1000);
        }
        await(label);
    }
    private void capture(String name) throws Exception {
        foreground();
        assertTrue(name.matches("[a-z0-9-]{1,70}"));
        assertTrue("No credential screen capture", loggedIn || !credentialsEntered);
        if(credentialsEntered)assertFalse("Never capture entered credentials", hasFilledPassword(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow()));
        // Accessibility state can lead SurfaceFlinger by one frame. Give the
        // asserted React Native state a bounded rendering interval before capture.
        SystemClock.sleep(400);
        assertTrue("Screenshot failed",device.takeScreenshot(new File(evidence,name+".png")));
        device.dumpWindowHierarchy(new File(evidence,name+".xml"));
    }
    private boolean hasFilledPassword(AccessibilityNodeInfo node) {
        if(node==null)return false;
        if(node.isPassword() && node.getText()!=null && node.getText().length()>0 && !node.getText().equals(node.getHintText()))return true;
        for(int i=0;i<node.getChildCount();i++)if(hasFilledPassword(node.getChild(i)))return true;
        return false;
    }
    private boolean passwordIsSecure(AccessibilityNodeInfo node,String label) {
        if(node==null)return false;
        if(label.contentEquals(node.getContentDescription()==null?"":node.getContentDescription()) && node.isPassword())return true;
        for(int i=0;i<node.getChildCount();i++)if(passwordIsSecure(node.getChild(i),label))return true;
        return false;
    }
    private void login() throws Exception {
        Bundle args=InstrumentationRegistry.getArguments();
        String port=args.getString("inputPort","");
        assertTrue("Exact local broker port required",port.matches("[1-9][0-9]{3,4}"));
        HttpURLConnection connection=(HttpURLConnection)new URL("http://127.0.0.1:"+port+"/fixture").openConnection();
        connection.setRequestProperty("X-Wishlist-Golden-Phase",phase);
        connection.setConnectTimeout(5000); connection.setReadTimeout(5000); connection.setInstanceFollowRedirects(false);
        assertEquals(200,connection.getResponseCode());
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        try(InputStream input=connection.getInputStream()) { byte[] buffer=new byte[512]; int count; while((count=input.read(buffer))!=-1){bytes.write(buffer,0,count);assertTrue(bytes.size()<4096);} }
        byte[] data=bytes.toByteArray(); connection.disconnect();
        assertTrue(data.length<4096);
        JSONObject fixture=new JSONObject(new String(data,StandardCharsets.UTF_8));
        target=fixture.getString("package");photoName=fixture.optString("photoName","");
        assertTrue(target.matches("com\\.hank_huang0516\\.snack425e646aa6a74ad8a964aadeb4741fc1\\.visualqa[0-9]{12}"));
        String email=fixture.getString("email");
        assertTrue("Synthetic account required",email.endsWith("@example.invalid"));
        Intent launch=new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            .setClassName(target,"com.hank_huang0516.snack425e646aa6a74ad8a964aadeb4741fc1.MainActivity")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        InstrumentationRegistry.getInstrumentation().getContext().startActivity(launch);
        checkpoint("synthetic-notice-and-login");
        device.waitForIdle(1500);capture("startup-before-credentials");
        // Only this isolated synthetic adult fixture. Never opens external policy links.
        long end=SystemClock.elapsedRealtime()+45000;
        boolean syntheticTermsChecked=false;
        while(SystemClock.elapsedRealtime()<end && !has("手機號碼或 Email")) {
            if(has("密碼") && has("登入"))break;
            if(has("我了解，繼續使用")) {click("我了解，繼續使用"); assertTrue("Notice must finish before another input",device.wait(Until.gone(By.desc("我了解，繼續使用")),10000));continue;}
            String unchecked="☐ 我已年滿 18 歲，已閱讀並同意使用條款及社群規範，並知悉隱私政策。";
            String checked=unchecked.replace('☐','☑');
            if(!syntheticTermsChecked&&has(unchecked)){click(unchecked);assertTrue("Synthetic fixture checkbox must update",device.wait(Until.hasObject(By.desc(checked)),10000));syntheticTermsChecked=true;continue;}
            if((syntheticTermsChecked||has(checked))&&has("同意並繼續")){click("同意並繼續");assertTrue("Synthetic fixture notice must close",device.wait(Until.gone(By.desc("同意並繼續")),10000));continue;}
            UiScrollable scroll=new UiScrollable(new UiSelector().scrollable(true));
            if(scroll.exists())scroll.scrollForward(35);
            SystemClock.sleep(200);
        }
        // The notice and auth form have different scroll heights. A layout
        // transition must not cause the test to keep scrolling past the first field.
        UiScrollable loginScroll=new UiScrollable(new UiSelector().scrollable(true));
        if(loginScroll.exists())loginScroll.scrollToBeginning(10);
        checkpoint("login-identifier");UiObject2 identifier=await("手機號碼或 Email");
        credentialsEntered=true;
        assertEquals("android.widget.EditText",identifier.getClassName()); identifier.setText(email);
        checkpoint("login-password");UiObject2 password=await("密碼"); assertTrue("Password must be secure",passwordIsSecure(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow(),"密碼"));
        password.setText(fixture.getString("password"));
        // ACTION_SET_TEXT need not open an IME. Back without an IME would
        // leave the app, rather than dismiss a keyboard.
        boolean keyboardVisible=false;
        for(AccessibilityWindowInfo window:InstrumentationRegistry.getInstrumentation().getUiAutomation().getWindows())
            if(window.getType()==AccessibilityWindowInfo.TYPE_INPUT_METHOD)keyboardVisible=true;
        if(keyboardVisible)device.pressBack();
        device.waitForIdle(1000);
        checkpoint("login-submit");reveal("登入"); click("登入"); await("我的");
        assertFalse("Credential form remains visible",has("手機號碼或 Email"));
        loggedIn=true; checkpoint("logged-in");
    }
    private void buyer() throws Exception {
        checkpoint("wish-card-and-editor"); click("願望");
        await("查看清單");click("查看清單");await("尋找符合商品");capture("golden-01-wish-cards");
        click("新增願望");await("照片辨識");await("手動輸入");capture("golden-02-photo-form");
        click("手動輸入");
        long modeEnd=SystemClock.elapsedRealtime()+10000;
        while(SystemClock.elapsedRealtime()<modeEnd && (!await("手動輸入").isSelected() || has("從相簿選擇願望照片")))SystemClock.sleep(100);
        assertTrue("Manual tab must be selected",await("手動輸入").isSelected());
        assertFalse("Manual mode must hide photo controls",has("從相簿選擇願望照片"));
        await("願望名稱");await("最高預算");await("儲存");
        reveal("手動輸入將儲存你填寫的名稱、預算與選填資訊，不會上傳照片或啟動 AI 辨識。");
        UiScrollable manualScroll=new UiScrollable(new UiSelector().scrollable(true));manualScroll.scrollToBeginning(10);
        assertTrue("Close stays fully reachable",await("關閉編輯").getVisibleBounds().height()>=44);
        capture("golden-02-manual-form");
        checkpoint("manual-wish-persistence");
        await("願望名稱").setText("Golden Manual Mug");await("最高預算").setText("42.5");
        click("儲存");assertTrue("Saved editor must close",device.wait(Until.gone(By.desc("關閉編輯")),15000));
        checkpoint("manual-wish-created");reveal("Golden Manual Mug");checkpoint("manual-wish-more");click("Golden Manual Mug的更多操作");await("編輯願望");checkpoint("manual-wish-edit");click("編輯願望");
        await("願望名稱").setText("Golden Edited Mug");click("儲存");
        assertTrue("Edited wish must return to list",device.wait(Until.gone(By.desc("關閉編輯")),15000));
        reveal("Golden Edited Mug");capture("golden-01-edited-wish");
        click("Golden Edited Mug的更多操作");click("隱藏願望");await("最高預算 TWD 42.5 · 已隱藏");
        click("Golden Edited Mug的更多操作");click("取消隱藏");await("最高預算 TWD 42.5");
        click("Golden Edited Mug的更多操作");click("標記完成");await("最高預算 TWD 42.5 · 已完成");
        click("Golden Edited Mug的更多操作");click("取消完成");await("最高預算 TWD 42.5");
        checkpoint("security-and-deletion-preview");click("我的");click("帳號安全");
        await("更改密碼");await("登出所有裝置");capture("golden-06-security-directory");
        reveal("刪除帳號");click("刪除帳號");await("刪除影響盤點");
        reveal("查看完整資料盤點（32項）");capture("golden-10-deletion-impact");
        reveal("永久刪除本人帳號");UiObject2 deletion=await("永久刪除本人帳號");
        while(!deletion.isClickable()&&deletion.getParent()!=null) deletion=deletion.getParent();
        assertFalse("Deletion requires password and exact confirmation",deletion.isEnabled());
        click("返回，不建立刪除操作");
        checkpoint("buyer-checks-complete");
    }
    private void seller() throws Exception {
        checkpoint("management-compact-card");click("我的");click("我的商品 · 閱覽與管理");
        await("標記保留");capture("golden-04-active-card");
        click("標記保留");await("標記已保留");click("標記已保留");
        // Exact synthetic fixture has one owned listing. Counts must change.
        await("已保留 (1)");click("已保留 (1)");await("恢復在售");capture("golden-04-reserved-card");
        click("恢復在售");await("確認恢復在售？");click("恢復在售");await("在售 (1)");
        click("關閉我的商品");
        checkpoint("batch-to-manual-transition");click("刊登好物");await("進階模式 · 選用  ↗");click("進階模式 · 選用  ↗");
        await("刊登好物");await("1 商品資料");await("2 交易與地點");await("3 確認刊登");capture("golden-03-manual-stage-one");
        click("取消");checkpoint("seller-checks-complete");
    }
    private void market() throws Exception {
        checkpoint("popularity-real-like");click("探索");await("切換清單");click("切換清單");
        String mug="二手深藍色陶瓷馬克杯，NT$ 50，新北市板橋區";
        reveal(mug);click(mug);await("商品詳情");checkpoint("popularity-detail");
        reveal("0 人喜歡，喜歡此商品，僅公開人數");await("0 人詢問中");
        click("0 人喜歡，喜歡此商品，僅公開人數");await("1 人喜歡，取消喜歡此商品");
        capture("golden-13-actual-like");checkpoint("popularity-explanation");click("關於人氣數據");await("詢問中");await("喜歡");
        assertTrue("Explanation always has a visible close control",await("關閉人氣說明").getVisibleBounds().height()>=44);
        assertTrue("Explanation acknowledgment stays in the viewport",await("知道了").getVisibleBounds().height()>=52);
        capture("golden-13-explanation-top");
        reveal("只公開總人數，不公開名單；不是排隊、保留或成交保證。資料無法讀取時顯示—，不以0代替。");
        capture("golden-13-count-explanation");assertTrue("Acknowledgment remains fixed after scrolling",await("知道了").getVisibleBounds().height()>=52);reveal("知道了");click("知道了");
        checkpoint("truthful-seller-storefront");reveal("查看賣場");click("查看賣場");
        await("販售中");await("追蹤");
        reveal("驗證電子郵件不代表身分認證或交易保證。");capture("golden-12-storefront");
        // Scroll to the header rather than tapping an off-screen control.
        UiScrollable storeScroll=new UiScrollable(new UiSelector().scrollable(true));storeScroll.scrollToBeginning(10);
        click("追蹤");await("取消追蹤");
        if(has("清理已確認的原操作"))click("清理已確認的原操作");
        reveal("關於");click("關於");reveal("尚未提供交易評價功能。");capture("golden-12-trust-info");
        assertFalse("No invented rating badges",has("5.0"));
        UiScrollable aboutScroll=new UiScrollable(new UiSelector().scrollable(true));aboutScroll.scrollToBeginning(10);
        click("返回");await("商品詳情");
        checkpoint("listing-report-receipt");click("檢舉商品");await("我的商品檢舉");
        reveal("其他");click("其他");reveal("檢舉補充說明，選填");
        await("檢舉補充說明，選填").setText("Golden isolated report only");
        reveal("送出商品檢舉");assertTrue("Report return remains reachable at the end of the form",await("返回探索，保留未確認紀錄").getVisibleBounds().height()>=44);capture("golden-09-report-form");click("送出商品檢舉");
        reveal("本人檢舉紀錄");click("本人檢舉紀錄");reveal("已收件，待審核");capture("golden-09-received-pending");
        checkpoint("market-checks-complete");
    }
    private void chat() throws Exception {
        checkpoint("chat-history-and-reply");click("社交");await("聊天與面交");click("Native QA Switch OLED");
        await("商品聊天訊息");await("週日下午可以，請先提出預約。");
        capture("golden-11-chat-before-reply");await("商品聊天訊息").setText("Golden Native Chat Reply");click("傳送");
        await("Golden Native Chat Reply");capture("golden-11-chat-reply");
        checkpoint("photo-composer-empty-validation");click("補傳商品照片");await("傳送商品照片");await("從相簿選擇");
        reveal("傳送照片");UiObject2 send=await("傳送照片");while(!send.isClickable()&&send.getParent()!=null)send=send.getParent();
        assertFalse("No photo means send remains disabled",send.isEnabled());capture("golden-11-empty-photo-form");click("返回聊天");
        checkpoint("meetup-proposal");await("查看或提議面交預約");click("查看或提議面交預約");
        reveal("提出面交邀約");click("提出面交邀約");reveal("私密面交地點名稱");await("私密面交地點名稱").setText("GoldenStationQA");
        reveal("送出面交邀約");click("送出面交邀約");
        UiScrollable proposalScroll=new UiScrollable(new UiSelector().scrollable(true));proposalScroll.scrollToBeginning(10);
        await("提議中");capture("golden-07-proposed");
        checkpoint("synthetic-seller-consent");
        String port=InstrumentationRegistry.getArguments().getString("inputPort","");
        HttpURLConnection consent=(HttpURLConnection)new URL("http://127.0.0.1:"+port+"/counterpart/confirm-meetup").openConnection();
        consent.setRequestMethod("POST");consent.setRequestProperty("X-Wishlist-Golden-Phase",phase);consent.setConnectTimeout(5000);consent.setReadTimeout(15000);consent.setInstanceFollowRedirects(false);
        assertEquals("Only this fixture seller may consent",200,consent.getResponseCode());consent.disconnect();
        reveal("更新預約狀態");click("更新預約狀態");
        UiScrollable confirmedScroll=new UiScrollable(new UiSelector().scrollable(true));confirmedScroll.scrollToBeginning(10);
        await("雙方已確認");await("GoldenStationQA");capture("golden-07-both-confirmed");
        checkpoint("meetup-cancel-edit-and-cancel");reveal("提議改期或修改地點");click("提議改期或修改地點");
        reveal("取消編輯");click("取消編輯");
        UiScrollable cancelEditScroll=new UiScrollable(new UiSelector().scrollable(true));cancelEditScroll.scrollToBeginning(10);await("雙方已確認");
        reveal("取消第1版預約");click("取消第1版預約");
        UiScrollable cancelledScroll=new UiScrollable(new UiSelector().scrollable(true));cancelledScroll.scrollToBeginning(10);await("已取消");reveal("先前已同意");assertFalse("Cancelled consent is historical",has("已同意"));capture("golden-07-cancelled");
        checkpoint("chat-checks-complete");
    }
    private void photo() throws Exception {
        assertTrue("Only an exact owned synthetic photo",photoName.matches("wishlist-golden-[0-9a-f-]{36}\\.jpg"));
        checkpoint("photo-open-chat");click("社交");click("Native QA Switch OLED");await("商品聊天訊息");click("補傳商品照片");await("傳送商品照片");
        checkpoint("photo-picker-select-owned-file");click("從相簿選擇");
        Set<String> pickerPackages=new HashSet<>(Arrays.asList("com.android.documentsui","com.google.android.documentsui","com.google.android.gms","com.google.android.packageinstaller","com.android.packageinstaller","com.android.permissioncontroller","com.google.android.permissioncontroller","com.google.android.providers.media.module","com.android.providers.media.module","android"));
        boolean rootsOpened=false,downloadsOpened=false,chosen=false;long end=SystemClock.elapsedRealtime()+35000;
        try{
            while(SystemClock.elapsedRealtime()<end){
                String current=device.getCurrentPackageName();
                if(chosen&&target.equals(current)&&has("待傳送商品照片預覽"))break;
                if(target.equals(current)){SystemClock.sleep(150);continue;}
                assertTrue("Unexpected app during owned picker flow",pickerPackages.contains(current));
                UiObject2 owned=node(photoName);
                // DocumentsUI delegates row clicks through RecyclerView; its title
                // and row may both report clickable=false. Tap the exact matched
                // filename rather than climbing to the whole directory container.
                if(!chosen&&owned!=null){assertTrue("Owned filename must be visible",owned.getVisibleBounds().width()>0&&owned.getVisibleBounds().height()>0);owned.click();chosen=true;device.waitForIdle(1000);continue;}
                UiObject2 allow=node("ALLOW");if(allow!=null&&current.contains("packageinstaller")){allow.click();device.waitForIdle(1000);continue;}
                if(!chosen&&!rootsOpened&&node("Show roots")!=null){node("Show roots").click();rootsOpened=true;device.waitForIdle(1000);continue;}
                if(!chosen&&!downloadsOpened&&node("Downloads")!=null){node("Downloads").click();downloadsOpened=true;device.waitForIdle(1000);continue;}
                if(chosen){UiObject2 open=device.findObject(By.text(java.util.regex.Pattern.compile("(?i)open|select|done")));if(open!=null&&open.isEnabled()){open.click();device.waitForIdle(1000);continue;}}
                SystemClock.sleep(150);
            }
            assertTrue("Exact owned photo must be selected",chosen);foreground();await("待傳送商品照片預覽");
        }catch(Throwable failure){
            if(pickerPackages.contains(device.getCurrentPackageName())){device.takeScreenshot(new File(evidence,"owned-picker-diagnostic.png"));device.dumpWindowHierarchy(new File(evidence,"owned-picker-diagnostic.xml"));}
            throw failure;
        }
        checkpoint("photo-preview-and-send");capture("golden-11-photo-preview");reveal("照片補充說明");await("照片補充說明").setText("GoldenAndroidPhoto");reveal("傳送照片");click("傳送照片");
        if(phase.equals("photo-recovery")){
            checkpoint("photo-lost-ack-recovery");
            reveal("尚未確認照片送出。請先查核原回執；不會自動重送。");
            reveal("照片補充說明");assertFalse("Pending caption cannot be edited",await("照片補充說明").isEnabled());
            assertFalse("Pending photo cannot be removed",has("移除照片"));
            reveal("尚未確認照片送出。請先查核原回執；不會自動重送。");capture("golden-08-photo-pending");
            String port=InstrumentationRegistry.getArguments().getString("inputPort","");
            HttpURLConnection check=(HttpURLConnection)new URL("http://127.0.0.1:"+port+"/photo/recovery-checkpoint").openConnection();
            check.setRequestProperty("X-Wishlist-Golden-Phase",phase);check.setConnectTimeout(5000);check.setReadTimeout(5000);check.setInstanceFollowRedirects(false);
            assertEquals("No resend or receipt read before the explicit lookup",200,check.getResponseCode());check.disconnect();
            reveal("確認照片傳送結果");click("確認照片傳送結果");
        }
        assertTrue("Photo composer closes only after acknowledgment",device.wait(Until.gone(By.text("傳送商品照片")),20000));
        await("放大商品照片");capture("golden-11-photo-sent");click("放大商品照片");await("商品照片放大檢視");capture("golden-11-photo-zoom");click("關閉商品照片");checkpoint("photo-checks-complete");
    }
    private void logout() throws Exception {
        checkpoint("never-enabled-push-logout");click("我的");click("帳號安全");click("登出此裝置");
        long end=SystemClock.elapsedRealtime()+25000;
        while(SystemClock.elapsedRealtime()<end&&!has("使用條款與社群安全")&&!has("手機號碼或 Email"))SystemClock.sleep(150);
        assertTrue("Sign-out must return to authentication",has("使用條款與社群安全")||has("手機號碼或 Email"));
        assertFalse("Signed-out account must not keep its tab bar",has("我的"));
        capture("golden-06-logged-out");checkpoint("logout-checks-complete");
    }
    @Test public void approvedMarketplaceRegression() throws Exception {
        device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        phase=InstrumentationRegistry.getArguments().getString("phase","");
        assertTrue("Explicit bounded phase required",phase.equals("buyer")||phase.equals("seller")||phase.equals("logout")||phase.equals("market")||phase.equals("chat")||phase.equals("photo")||phase.equals("photo-recovery"));
        File external=InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
        assertNotNull("Owned test-host storage unavailable",external);
        evidence=new File(external,"golden-"+phase);
        assertTrue("Fresh owned evidence directory required",!evidence.exists()&&evidence.mkdirs());
        try { login(); if(phase.equals("buyer"))buyer();else if(phase.equals("seller"))seller();else if(phase.equals("market"))market();else if(phase.equals("chat"))chat();else if(phase.equals("photo")||phase.equals("photo-recovery"))photo();else logout(); }
        catch(Throwable failure){
            if(loggedIn||!credentialsEntered)try{capture("failed-"+stage);}catch(Throwable ignored){}
            String reason=failure instanceof AssertionError?String.valueOf(failure.getMessage()):"withheld";
            if(!reason.matches("[A-Za-z0-9 .:;_()<>?=/'-]{1,300}"))reason="withheld";
            throw new AssertionError("Golden regression failed at "+stage+" type "+failure.getClass().getSimpleName()+" reason "+reason);
        }
    }
}
