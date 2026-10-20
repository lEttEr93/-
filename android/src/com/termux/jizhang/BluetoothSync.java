package com.termux.jizhang;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import org.json.JSONObject;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.util.UUID;

/** Paired, authenticated RFCOMM; no Wi-Fi, cloud, discoverability or audio changes. */
public final class BluetoothSync {
    public interface Listener { void request(String json); void closed(); }
    private static final UUID SERVICE = UUID.fromString("b87c73a1-9c63-4ba4-a8c6-2198b4201400");
    private static final int MAX = 8 * 1024 * 1024;
    private final Listener listener;
    private volatile boolean running;
    private volatile String status = "未开启";
    private volatile String pendingId = "";
    private BluetoothServerSocket server;
    private BluetoothSocket peer;
    private DataOutputStream output;

    public BluetoothSync(Listener listener) { this.listener = listener; }
    public String status() { return status; }
    public boolean isRunning() { return running; }
    public synchronized void start() {
        if (running) return;
        running = true;
        status = "正在开启…";
        new Thread(new Runnable() { public void run() { serve(); } }, "campus-bluetooth").start();
    }
    private void serve() {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) throw new Exception("请先打开系统蓝牙");
            server = adapter.listenUsingRfcommWithServiceRecord("CampusLifeSync", SERVICE);
            while (running) {
                status = "等待已配对电脑连接，请保持应用打开";
                BluetoothSocket socket = server.accept();
                if (!running) { socket.close(); break; }
                if (socket.getRemoteDevice().getBondState() != BluetoothDevice.BOND_BONDED) {
                    socket.close(); continue;
                }
                peer = socket;
                synchronized (this) { output = new DataOutputStream(socket.getOutputStream()); }
                status = "已连接：" + socket.getRemoteDevice().getName();
                try {
                    DataInputStream input = new DataInputStream(socket.getInputStream());
                    while (running) {
                        int length = input.readInt();
                        if (length < 2 || length > MAX) throw new Exception("无效的数据帧");
                        byte[] body = new byte[length]; input.readFully(body);
                        JSONObject request = new JSONObject(new String(body, "UTF-8"));
                        String type = request.optString("type"), id = request.optString("id");
                        if (request.optInt("protocol") != 1 || !("pull".equals(type) || "push".equals(type)) || !id.matches("[A-Za-z0-9-]{1,80}")) throw new Exception("协议版本或请求不正确");
                        synchronized (this) {
                            if (pendingId.length() != 0) {
                                JSONObject busy = new JSONObject(); busy.put("protocol", 1); busy.put("id", id); busy.put("type", "error"); busy.put("error", "手机还有待确认的同步，请先处理"); send(busy); continue;
                            }
                            pendingId = id;
                        }
                        listener.request(request.toString());
                    }
                } catch (Exception ignored) {
                    // A disconnected computer must never modify the local ledger.
                } finally {
                    synchronized (this) { output = null; pendingId = ""; }
                    try { socket.close(); } catch (Exception ignored) { }
                    peer = null; listener.closed();
                }
            }
        } catch (Exception e) {
            status = "蓝牙不可用：" + e.getMessage();
        } finally {
            running = false;
            if (server != null) try { server.close(); } catch (Exception ignored) { }
            server = null;
        }
    }
    public synchronized boolean reply(String id, String json) {
        if (!id.equals(pendingId) || output == null) return false;
        try {
            JSONObject response = new JSONObject(json);
            response.put("protocol", 1); response.put("id", id);
            send(response); pendingId = ""; return true;
        } catch (Exception e) { status = "发送失败，请重新连接：" + e.getMessage(); return false; }
    }
    private synchronized void send(JSONObject json) throws Exception {
        byte[] bytes = json.toString().getBytes("UTF-8");
        if (bytes.length > MAX) throw new Exception("同步数据超过 8 MB");
        output.writeInt(bytes.length); output.write(bytes); output.flush();
    }
    public synchronized void stop() {
        running = false; status = "未开启"; pendingId = "";
        if (peer != null) try { peer.close(); } catch (Exception ignored) { }
        if (server != null) try { server.close(); } catch (Exception ignored) { }
    }
}
