using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Buffers.Binary;

// Secure RFCOMM client. Android advertises the matching UUID via SDP.
internal static class Program
{
    private const int MaxFrame = 8 * 1024 * 1024;
    private static readonly Guid ServiceId = new("b87c73a1-9c63-4ba4-a8c6-2198b4201400");
    private static readonly object OutputLock = new();
    private static nint connection = -1;
    private static void Emit(object value) { lock (OutputLock) Console.WriteLine(JsonSerializer.Serialize(value)); }
    static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length == 1 && args[0] == "list") { ListDevices(); return 0; }
            if (args.Length != 2 || args[0] != "connect") throw new Exception("Usage: CampusBluetooth list | connect AABBCCDDEEFF");
            if (Native.WSAStartup(0x0202, new byte[512]) != 0) throw new Exception("WSAStartup failed");
            connection = Native.socket(32, 1, 3); // AF_BTH, SOCK_STREAM, BTHPROTO_RFCOMM
            if (connection == -1) throw SocketError("socket");
            int enabled=1;
            if(Native.setsockopt(connection,3,unchecked((int)0x80000001),ref enabled,4)!=0)throw SocketError("authenticate");
            if(Native.setsockopt(connection,3,2,ref enabled,4)!=0)throw SocketError("encrypt");
            // ws2bth.h explicitly uses pshpack1: SOCKADDR_BTH is 30 bytes,
            // including on x64. It must not use normal 8-byte struct alignment.
            byte[] endpoint = new byte[30];
            BinaryPrimitives.WriteUInt16LittleEndian(endpoint, 32);
            BinaryPrimitives.WriteUInt64LittleEndian(endpoint.AsSpan(2), Convert.ToUInt64(args[1], 16));
            ServiceId.ToByteArray().CopyTo(endpoint, 10);
            if (Native.connect(connection, endpoint, endpoint.Length) != 0) throw SocketError("connect");
            // RFCOMM authentication/encryption is also required by Android's secure listener.
            Emit(new { type = "$connected" });
            var writer = new Thread(() =>
            {
                try
                {
                    string? line;
                    while ((line = Console.ReadLine()) != null)
                    {
                        byte[] payload = Encoding.UTF8.GetBytes(line);
                        if (payload.Length > MaxFrame) throw new Exception("Frame too large");
                        byte[] packet = new byte[4 + payload.Length];
                        BinaryPrimitives.WriteInt32BigEndian(packet, payload.Length); payload.CopyTo(packet, 4);
                        int offset = 0;
                        while (offset < packet.Length)
                        {
                            byte[] remaining = packet.AsSpan(offset,Math.Min(65536,packet.Length-offset)).ToArray();
                            int count = Native.send(connection, remaining, remaining.Length, 0);
                            if (count <= 0) throw SocketError("send");
                            offset += count;
                        }
                    }
                }
                catch (Exception e) { Emit(new { type = "$error", error = e.Message }); }
                finally { Native.closesocket(connection); }
            }) { IsBackground = true };
            writer.Start();
            while (true)
            {
                byte[] header = Receive(4);
                int length = BinaryPrimitives.ReadInt32BigEndian(header);
                if (length < 2 || length > MaxFrame) throw new Exception("Invalid frame length");
                string json = new UTF8Encoding(false, true).GetString(Receive(length));
                using (JsonDocument.Parse(json)) { }
                lock (OutputLock) Console.WriteLine(json);
            }
        }
        catch (Exception e) { Emit(new { type = "$error", error = e.Message }); return 1; }
        finally { if (connection != -1) Native.closesocket(connection); Native.WSACleanup(); }
    }
    private static Exception SocketError(string call) => new($"{call}: Windows 蓝牙错误 {Native.WSAGetLastError()}。请确认手机已配对并开启应用内蓝牙同步。");
    private static byte[] Receive(int length)
    {
        byte[] result = new byte[length]; int offset = 0;
        while (offset < length)
        {
            byte[] part = new byte[Math.Min(65536, length - offset)];
            int read = Native.recv(connection, part, part.Length, 0);
            if (read <= 0) throw new Exception("蓝牙连接已断开");
            Buffer.BlockCopy(part, 0, result, offset, read); offset += read;
        }
        return result;
    }
    private static void ListDevices()
    {
        var query = new Search { Size = (uint)Marshal.SizeOf<Search>(), Authenticated = 1, Remembered = 1, Connected = 1 };
        var device = new Device { Size = (uint)Marshal.SizeOf<Device>(), Name = "" };
        nint handle = Native.BluetoothFindFirstDevice(ref query, ref device);
        var devices = new List<object>();
        if (handle != 0)
        {
            try
            {
                do { devices.Add(new { name = device.Name, address = device.Address.ToString("X12"), connected = device.Connected != 0, paired = device.Authenticated != 0 || device.Remembered != 0 }); }
                while (Native.BluetoothFindNextDevice(handle, ref device));
            }
            finally { Native.BluetoothFindDeviceClose(handle); }
        }
        Emit(devices);
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Search { public uint Size; public int Authenticated, Remembered, Unknown, Connected, Inquiry; public byte Timeout; public nint Radio; }
    [StructLayout(LayoutKind.Sequential)]
    private struct SystemTime { public ushort Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Device
    {
        public uint Size; public ulong Address; public uint Class;
        public int Connected, Remembered, Authenticated;
        public SystemTime LastSeen, LastUsed;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 248)] public string Name;
    }
    private static class Native
    {
        [DllImport("bthprops.cpl", SetLastError = true)] public static extern nint BluetoothFindFirstDevice(ref Search search, ref Device device);
        [DllImport("bthprops.cpl", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool BluetoothFindNextDevice(nint handle, ref Device device);
        [DllImport("bthprops.cpl")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool BluetoothFindDeviceClose(nint handle);
        [DllImport("ws2_32.dll")] public static extern int WSAStartup(ushort version, [Out] byte[] data);
        [DllImport("ws2_32.dll")] public static extern int WSACleanup();
        [DllImport("ws2_32.dll")] public static extern int WSAGetLastError();
        [DllImport("ws2_32.dll")] public static extern nint socket(int family, int type, int protocol);
        [DllImport("ws2_32.dll")] public static extern int setsockopt(nint socket,int level,int option,ref int value,int length);
        [DllImport("ws2_32.dll")] public static extern int connect(nint socket, byte[] address, int length);
        [DllImport("ws2_32.dll")] public static extern int send(nint socket, byte[] buffer, int length, int flags);
        [DllImport("ws2_32.dll")] public static extern int recv(nint socket, [Out] byte[] buffer, int length, int flags);
        [DllImport("ws2_32.dll")] public static extern int closesocket(nint socket);
    }
}
