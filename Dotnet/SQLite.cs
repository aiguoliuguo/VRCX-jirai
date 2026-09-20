using System;
using System.Collections.Generic;
using System.Data.SQLite;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;

namespace VRCX
{
    public class SQLite
    {
        public static SQLite Instance;
        private readonly ReaderWriterLockSlim m_ConnectionLock;
        private SQLiteConnection m_Connection;

        static SQLite()
        {
            Instance = new SQLite();
        }

        public SQLite()
        {
            m_ConnectionLock = new ReaderWriterLockSlim();
        }

        public void Init()
        {
#if LINUX
            Instance = this;
#endif
            var dataSource = Program.ConfigLocation;
            var jsonDataSource = VRCXStorage.Instance.Get("VRCX_DatabaseLocation");
            if (!string.IsNullOrEmpty(jsonDataSource))
                dataSource = jsonDataSource;

            m_Connection = new SQLiteConnection($"Data Source=\"{dataSource}\";Version=3;PRAGMA locking_mode=NORMAL;PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;PRAGMA optimize=0x10002;", true);

            m_Connection.Open();
        }

        public void Exit()
        {
            m_Connection.Close();
            m_Connection.Dispose();
        }

        // for Electron
        public string ExecuteJson(string sql, IDictionary<string, object>? args = null)
        {
            var result = Execute(sql, args);
            return JsonSerializer.Serialize(result);
        }

        public object[][] Execute(string sql, IDictionary<string, object>? args = null)
        {
            m_ConnectionLock.EnterReadLock();
            try
            {
                using var command = new SQLiteCommand(sql, m_Connection);
                if (args != null)
                {
                    foreach (var arg in args)
                    {
                        command.Parameters.Add(new SQLiteParameter(arg.Key, arg.Value));
                    }
                }

                using var reader = command.ExecuteReader();
                var result = new List<object[]>();
                while (reader.Read())
                {
                    var values = new object[reader.FieldCount];
                    for (var i = 0; i < reader.FieldCount; i++)
                    {
                        values[i] = reader.GetValue(i);
                    }
                    result.Add(values);
                }
                return result.ToArray();
            }
            finally
            {
                m_ConnectionLock.ExitReadLock();
            }
        }

        public int ExecuteNonQuery(string sql, IDictionary<string, object>? args = null)
        {
            var result = -1;
            m_ConnectionLock.EnterWriteLock();
            try
            {
                using var command = new SQLiteCommand(sql, m_Connection);
                if (args != null)
                {
                    foreach (var arg in args)
                    {
                        command.Parameters.Add(new SQLiteParameter(arg.Key, arg.Value));
                    }
                }
                result = command.ExecuteNonQuery();
            }
            finally
            {
                m_ConnectionLock.ExitWriteLock();
            }

            return result;
        }

        // ─── Database import helpers (Electron) ────────────────────────────

        private static string GetDatabasePath()
        {
            var dataSource = Program.ConfigLocation;
            var jsonDataSource = VRCXStorage.Instance.Get("VRCX_DatabaseLocation");
            if (!string.IsNullOrEmpty(jsonDataSource))
                dataSource = jsonDataSource;
            return dataSource;
        }

        private static SQLiteConnection OpenReadOnlyConnection(string sourcePath)
        {
            return new SQLiteConnection(
                $"Data Source=\"{sourcePath}\";Version=3;Read Only=True;PRAGMA busy_timeout=5000;",
                true
            );
        }

        /// <summary>
        /// Check whether an external database file exists, is a valid VRCX
        /// database (has gamelog_join_leave) and how much data it holds,
        /// relative to the currently opened database.
        /// When originalPath is empty, defaults to the original VRCX database
        /// location on Windows: %APPDATA%\VRCX\VRCX.sqlite3
        /// Returns JSON: { ok, exists, valid, sourceRows, sourceFriends, sourceSize, currentRows, error }
        /// </summary>
        public string CheckOriginalDatabase(string originalPath = "")
        {
            var result = new Dictionary<string, object?> { ["ok"] = true, ["exists"] = false, ["valid"] = false };
            if (string.IsNullOrWhiteSpace(originalPath) && !OperatingSystem.IsWindows())
            {
                result["error"] = "unsupported_platform";
                return JsonSerializer.Serialize(result);
            }
            if (string.IsNullOrWhiteSpace(originalPath))
            {
                originalPath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "VRCX",
                    "VRCX.sqlite3"
                );
            }

            if (File.Exists(originalPath))
            {
                result["exists"] = true;
                var info = new FileInfo(originalPath);
                result["sourceSize"] = info.Length;
                result["path"] = originalPath;

                try
                {
                    using var conn = OpenReadOnlyConnection(originalPath);
                    conn.Open();
                    using var tableCmd = new SQLiteCommand(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='gamelog_join_leave'",
                        conn
                    );
                    var hasGamelog = Convert.ToInt64(tableCmd.ExecuteScalar()) > 0;
                    result["valid"] = hasGamelog;
                    if (hasGamelog)
                    {
                        using var rowsCmd = new SQLiteCommand("SELECT COUNT(*) FROM gamelog_join_leave", conn);
                        result["sourceRows"] = Convert.ToInt64(rowsCmd.ExecuteScalar());

                        using var friendsCmd = new SQLiteCommand(
                            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'usr%_friend_log_current'",
                            conn
                        );
                        var prefixCount = Convert.ToInt64(friendsCmd.ExecuteScalar());
                        result["sourceFriends"] = prefixCount > 0
                            ? CountFriendRows(conn)
                            : (long)0;
                    }
                }
                catch (Exception)
                {
                    result["valid"] = false;
                }
            }

            result["currentRows"] = GetCurrentGamelogRows();
            return JsonSerializer.Serialize(result);
        }

        private static long CountFriendRows(SQLiteConnection conn)
        {
            try
            {
                var tables = new List<string>();
                using (var listCmd = new SQLiteCommand(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'usr%_friend_log_current'",
                    conn
                ))
                using (var reader = listCmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        tables.Add(reader.GetString(0));
                    }
                }
                long total = 0;
                foreach (var table in tables)
                {
                    using var rowsCmd = new SQLiteCommand($"SELECT COUNT(*) FROM \"{table}\"", conn);
                    total += Convert.ToInt64(rowsCmd.ExecuteScalar());
                }
                return total;
            }
            catch (Exception)
            {
                return 0;
            }
        }

        /// <summary>
        /// Validate an external database file before importing it as the new
        /// main database. Returns JSON:
        /// { ok, exists, valid, hasGamelog, sourceRows, sourceFriends, sourceSize, samePath, error }
        /// </summary>
        public string ValidateDatabase(string sourcePath)
        {
            var result = new Dictionary<string, object?> { ["ok"] = false, ["valid"] = false };
            if (string.IsNullOrWhiteSpace(sourcePath))
            {
                result["error"] = "empty_path";
                return JsonSerializer.Serialize(result);
            }

            var currentPath = GetDatabasePath();
            if (Path.GetFullPath(sourcePath).Equals(Path.GetFullPath(currentPath), StringComparison.OrdinalIgnoreCase))
            {
                result["error"] = "same_path";
                return JsonSerializer.Serialize(result);
            }

            if (!File.Exists(sourcePath))
            {
                result["error"] = "not_found";
                return JsonSerializer.Serialize(result);
            }

            result["exists"] = true;
            result["sourceSize"] = new FileInfo(sourcePath).Length;
            result["samePath"] = false;

            try
            {
                using var conn = OpenReadOnlyConnection(sourcePath);
                conn.Open();

                using var tableCmd = new SQLiteCommand(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='gamelog_join_leave'",
                    conn
                );
                var hasGamelog = Convert.ToInt64(tableCmd.ExecuteScalar()) > 0;
                result["hasGamelog"] = hasGamelog;
                if (!hasGamelog)
                {
                    result["error"] = "not_vrcx_db";
                    return JsonSerializer.Serialize(result);
                }

                using var rowsCmd = new SQLiteCommand("SELECT COUNT(*) FROM gamelog_join_leave", conn);
                result["sourceRows"] = Convert.ToInt64(rowsCmd.ExecuteScalar());
                result["sourceFriends"] = CountFriendRows(conn);
                result["valid"] = true;
                result["ok"] = true;
                result["currentRows"] = GetCurrentGamelogRows();
                result["currentSize"] = new FileInfo(GetDatabasePath()).Length;
                result["currentFriends"] = GetCurrentFriendRows();
            }
            catch (Exception)
            {
                result["error"] = "invalid_sqlite";
            }

            return JsonSerializer.Serialize(result);
        }

        /// <summary>
        /// Replace the current main database with an external database file.
        /// Backs up the current database first (VRCX-backup.&lt;timestamp&gt;.sqlite3),
        /// then re-opens the connection. Returns JSON:
        /// { ok, backupPath, error }
        /// </summary>
        public string ImportDatabase(string sourcePath)
        {
            var result = new Dictionary<string, object?> { ["ok"] = false };
            var currentPath = GetDatabasePath();

            if (string.IsNullOrWhiteSpace(sourcePath) || !File.Exists(sourcePath))
            {
                result["error"] = "source_missing";
                return JsonSerializer.Serialize(result);
            }
            if (Path.GetFullPath(sourcePath).Equals(Path.GetFullPath(currentPath), StringComparison.OrdinalIgnoreCase))
            {
                result["error"] = "same_path";
                return JsonSerializer.Serialize(result);
            }

            // Quick pre-check so the import fails before closing the live connection.
            var validation = ValidateDatabase(sourcePath);
            var validationJson = JsonSerializer.Deserialize<JsonNode>(validation);
            if (validationJson?["ok"]?.GetValue<bool>() != true)
            {
                result["error"] = validationJson?["error"]?.GetValue<string>() ?? "invalid";
                return JsonSerializer.Serialize(result);
            }

            m_ConnectionLock.EnterWriteLock();
            try
            {
                var backupPath = Path.Combine(
                    Path.GetDirectoryName(currentPath) ?? ".",
                    $"VRCX-backup.{DateTime.Now:yyyyMMdd.HHmmss}.sqlite3"
                );
                // Flush any pending WAL data into the main database file first,
                // so the backup contains the latest writes.
                try
                {
                    using var checkpointCmd = new SQLiteCommand("PRAGMA wal_checkpoint(TRUNCATE)", m_Connection);
                    checkpointCmd.ExecuteNonQuery();
                }
                catch (Exception)
                {
                    // Best effort only, the backup still covers the main file.
                }
                File.Copy(currentPath, backupPath);

                m_Connection.Close();
                m_Connection.Dispose();

                foreach (var suffix in new[] { "-wal", "-shm" })
                {
                    var file = currentPath + suffix;
                    if (File.Exists(file))
                    {
                        try { File.Delete(file); } catch { /* best effort */ }
                    }
                }

                File.Copy(sourcePath, currentPath, true);

                foreach (var suffix in new[] { "-wal", "-shm" })
                {
                    var file = currentPath + suffix;
                    if (File.Exists(file))
                    {
                        try { File.Delete(file); } catch { /* best effort */ }
                    }
                }
                foreach (var suffix in new[] { $"-{DateTime.Now:yyyyMMdd}-wal", $"-{DateTime.Now:yyyyMMdd}-shm" })
                {
                    var file = currentPath + suffix;
                    if (File.Exists(file))
                    {
                        try { File.Delete(file); } catch { /* best effort */ }
                    }
                }

                result["ok"] = true;
                result["backupPath"] = backupPath;
            }
            catch (Exception ex)
            {
                result["error"] = ex.Message;
            }
            finally
            {
                try
                {
                    Init();
                }
                catch (Exception ex)
                {
                    result["ok"] = false;
                    result["error"] = "reopen_failed: " + ex.Message;
                }
                m_ConnectionLock.ExitWriteLock();
            }

            return JsonSerializer.Serialize(result);
        }

        private long GetCurrentGamelogRows()
        {
            try
            {
                var rows = Execute("SELECT COUNT(*) FROM gamelog_join_leave");
                if (rows.Length > 0 && rows[0].Length > 0)
                {
                    return Convert.ToInt64(rows[0][0]);
                }
                return 0;
            }
            catch (Exception)
            {
                return 0;
            }
        }

        private long GetCurrentFriendRows()
        {
            try
            {
                var tables = Execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'usr%_friend_log_current'"
                );
                long total = 0;
                foreach (var row in tables)
                {
                    if (row.Length > 0 && row[0] is string table)
                    {
                        var countRows = Execute($"SELECT COUNT(*) FROM \"{table}\"");
                        if (countRows.Length > 0 && countRows[0].Length > 0)
                        {
                            total += Convert.ToInt64(countRows[0][0]);
                        }
                    }
                }
                return total;
            }
            catch (Exception)
            {
                return 0;
            }
        }
    }
}
