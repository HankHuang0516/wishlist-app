package com.hankhuang.wishlistgoldenqa;

import android.content.Intent;
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
    private String target, phase, stage = "setup";
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
        foreground(); UiObject2 found = await(label);
        for (int depth = 0; !found.isClickable() && depth < 5; depth++) {
            found = found.getParent(); assertNotNull("Expected actionable ancestor at " + stage, found);
        }
        assertTrue("Expected clickable control at " + stage, found.isClickable());
        assertTrue("Expected enabled control at " + stage, found.isEnabled());
        found.click(); device.waitForIdle(1500);
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
        target=fixture.getString("package");
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
        assertTrue("Close stays fully reachable",await("關閉編輯").getVisibleBounds().height()>=44);
        capture("golden-02-manual-form");
        checkpoint("manual-wish-persistence");
        await("願望名稱").setText("Golden Manual Mug");await("最高預算").setText("42.5");
        click("儲存");assertTrue("Saved editor must close",device.wait(Until.gone(By.desc("關閉編輯")),15000));
        reveal("Golden Manual Mug");click("Golden Manual Mug的更多操作");click("編輯願望");
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
    @Test public void approvedMarketplaceRegression() throws Exception {
        device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        phase=InstrumentationRegistry.getArguments().getString("phase","");
        assertTrue("Explicit bounded phase required",phase.equals("buyer")||phase.equals("seller"));
        File external=InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null);
        assertNotNull("Owned test-host storage unavailable",external);
        evidence=new File(external,"golden-"+phase);
        assertTrue("Fresh owned evidence directory required",!evidence.exists()&&evidence.mkdirs());
        try { login(); if(phase.equals("buyer"))buyer();else seller(); }
        catch(Throwable failure){
            if(loggedIn||!credentialsEntered)try{capture("failed-"+stage);}catch(Throwable ignored){}
            String reason=failure instanceof AssertionError?String.valueOf(failure.getMessage()):"withheld";
            if(!reason.matches("[A-Za-z0-9 .:;_()<>?=/'-]{1,300}"))reason="withheld";
            throw new AssertionError("Golden regression failed at "+stage+" type "+failure.getClass().getSimpleName()+" reason "+reason);
        }
    }
}
