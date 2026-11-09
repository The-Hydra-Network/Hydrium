using System;
using System.Diagnostics;
using System.IO;
using System.Media;
using System.Net.Http;
using System.Reflection;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.ComponentModel;
using System.Windows.Controls;
using System.Windows.Input;
using Microsoft.Win32;

namespace Hydrlauncher
{
    public partial class MainWindow : Window
    {
        private static readonly HttpClient InstallerHttpClient = new()
        {
            Timeout = Timeout.InfiniteTimeSpan
        };

        private readonly SoundPlayer? _clickSound;
        private readonly MemoryStream? _clickSoundStream;
        private readonly SoundPlayer? _backgroundMusic;
        private readonly MemoryStream? _backgroundMusicStream;
        private const string GamePath = "C:\\Hydrium\\RecRoom.exe";
        private bool _isVrMode;
        private CancellationTokenSource? _installerCancellation;
        private bool _closeWhenInstallerStops;

        protected override void OnClosed(EventArgs e)
        {
            _backgroundMusic?.Stop();
            _clickSound?.Stop();
            _clickSoundStream?.Dispose();
            _backgroundMusicStream?.Dispose();
            base.OnClosed(e);
        }

        public MainWindow()
        {
            InitializeComponent();
            UpdateModeButtons();

            (_clickSound, _clickSoundStream) =
                LoadEmbeddedSoundPlayer("Hydrlauncher.Assets.HydriumClick.wav");
            (_backgroundMusic, _backgroundMusicStream) =
                LoadEmbeddedSoundPlayer("Hydrlauncher.Assets.HydriumSongPlayable.wav");
            TryPlayBackgroundMusic();
        }

        private static (SoundPlayer? Player, MemoryStream? Stream) LoadEmbeddedSoundPlayer(string resourceName)
        {
            using var resourceStream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
            if (resourceStream == null)
            {
                return (null, null);
            }

            MemoryStream? soundStream = null;
            try
            {
                soundStream = new MemoryStream();
                resourceStream.CopyTo(soundStream);
                soundStream.Position = 0;
                var player = new SoundPlayer(soundStream);
                player.Load();
                return (player, soundStream);
            }
            catch (InvalidOperationException)
            {
                soundStream?.Dispose();
                return (null, null);
            }
            catch (IOException)
            {
                soundStream?.Dispose();
                return (null, null);
            }
        }

        private void TryPlayBackgroundMusic()
        {
            try
            {
                _backgroundMusic?.PlayLooping();
            }
            catch (InvalidOperationException)
            {
                StatusTextBlock.Text = "Background music could not be played; the launcher is ready.";
            }
        }

        private void PlayClickSound()
        {
            try
            {
                _clickSound?.Play();
            }
            catch (InvalidOperationException)
            {
                StatusTextBlock.Text = "Button sound could not be played.";
            }
        }

        private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                DragMove();
            }
        }

        private void MinimizeWindow(object sender, RoutedEventArgs e)
        {
            PlayClickSound();
            WindowState = WindowState.Minimized;
        }

        private void CloseWindow(object sender, RoutedEventArgs e)
        {
            PlayClickSound();
            Close();
        }

        private void MainWindow_Closing(object? sender, CancelEventArgs e)
        {
            if (_installerCancellation == null)
            {
                return;
            }

            e.Cancel = true;
            _closeWhenInstallerStops = true;
            StatusTextBlock.Text = "Canceling installer download before closing...";
            _installerCancellation.Cancel();
        }

        private void FindGameButton_Click(object sender, RoutedEventArgs e)
        {
            PlayClickSound();
            var dialog = new OpenFileDialog
            {
                Title = "Find Hydrium",
                Filter = "Hydrium game (RecRoom.exe)|RecRoom.exe",
                CheckFileExists = true,
                InitialDirectory = Directory.Exists("C:\\Hydrium") ? "C:\\Hydrium" : "C:\\"
            };

            if (dialog.ShowDialog(this) != true)
            {
                return;
            }

            if (!IsValidGamePath(dialog.FileName))
            {
                StatusTextBlock.Text = "Only C:\\Hydrium\\RecRoom.exe is accepted.";
                MessageBox.Show(
                    "Select the Hydrium game at C:\\Hydrium\\RecRoom.exe. Other game files are not allowed.",
                    "Invalid game path",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }

            GamePathTextBox.Text = GamePath;
            StatusTextBlock.Text = "Hydrium game path found.";
        }

        private void LoginButton_Click(object sender, RoutedEventArgs e)
        {
            PlayClickSound();
            var loginWindow = new LoginWindow { Owner = this };
            if (loginWindow.ShowDialog() != true)
            {
                return;
            }

            AccountStatusTextBlock.Text = $"Signed in as {loginWindow.Username}";
            AccountNameTextBox.Text = loginWindow.Username;
            PlayerNameTextBlock.Text = loginWindow.IsDeveloper
                ? $"{loginWindow.DisplayName} [Developer]"
                : loginWindow.DisplayName;
            PlayerRoleTextBlock.Text = loginWindow.RoleLabel;
            StatusTextBlock.Text = loginWindow.IsDeveloper
                ? "Signed in successfully. Developer role verified by Hydrium."
                : loginWindow.RoleLabel == "Role: Player"
                    ? "Signed in successfully."
                    : "Signed in; account role could not be verified.";
        }

        private async void InstallGameButton_Click(object sender, RoutedEventArgs e)
        {
                PlayClickSound();
                if (_installerCancellation != null)
                {
                    return;
                }

                var installerUri = GetInstallerUri();
                if (installerUri == null)
                {
                    return;
                }

                var installDirectory = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "HydriumLauncher",
                    "Installers");
                var installerPath = Path.Combine(installDirectory, "HydriumSetup.exe");
                var partialPath = installerPath + ".download";

                using var cancellation = new CancellationTokenSource();
                _installerCancellation = cancellation;
                InstallGameButton.IsEnabled = false;
                CancelInstallButton.Visibility = Visibility.Visible;
                InstallerProgressBar.Visibility = Visibility.Visible;
                InstallerStatusTextBlock.Visibility = Visibility.Visible;
                InstallerProgressBar.IsIndeterminate = true;
                InstallerStatusTextBlock.Text = "Connecting to the Hydrium download server...";

                try
                {
                    Directory.CreateDirectory(installDirectory);
                    using var response = await InstallerHttpClient.GetAsync(
                        installerUri,
                        HttpCompletionOption.ResponseHeadersRead,
                        cancellation.Token);

                    if (!response.IsSuccessStatusCode)
                    {
                        throw new HttpRequestException(
                            $"Download server returned HTTP {(int)response.StatusCode}.");
                    }

                    var finalUri = response.RequestMessage?.RequestUri;
                    if (finalUri == null ||
                        finalUri.Scheme != Uri.UriSchemeHttps ||
                        !finalUri.Host.Equals(installerUri.Host, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidDataException(
                            "The download redirected away from the trusted Hydrium CDN host.");
                    }

                    var contentLength = response.Content.Headers.ContentLength;
                    var drive = new DriveInfo(Path.GetPathRoot(installDirectory)!);
                    if (contentLength.HasValue &&
                        contentLength.Value > drive.AvailableFreeSpace - 100L * 1024 * 1024)
                    {
                        throw new IOException(
                            "There is not enough free disk space to download the Hydrium installer.");
                    }

                    await using var source = await response.Content.ReadAsStreamAsync(cancellation.Token);
                    await using var destination = new FileStream(
                        partialPath,
                        FileMode.Create,
                        FileAccess.Write,
                        FileShare.None,
                        1024 * 128,
                        FileOptions.Asynchronous | FileOptions.SequentialScan);

                    var buffer = new byte[1024 * 128];
                    var bytesDownloaded = 0L;
                    var lastProgressUpdate = DateTime.UtcNow;
                    var firstBytes = new byte[2];
                    var firstBytesCount = 0;

                    while (true)
                    {
                        var bytesRead = await source.ReadAsync(buffer.AsMemory(), cancellation.Token);
                        if (bytesRead == 0)
                        {
                            break;
                        }

                        if (drive.AvailableFreeSpace < bytesRead + 100L * 1024 * 1024)
                        {
                            throw new IOException(
                                "There is not enough free disk space to finish downloading the installer.");
                        }

                        if (firstBytesCount < firstBytes.Length)
                        {
                            var bytesToCheck = Math.Min(bytesRead, firstBytes.Length - firstBytesCount);
                            Array.Copy(buffer, 0, firstBytes, firstBytesCount, bytesToCheck);
                            firstBytesCount += bytesToCheck;
                            if (firstBytesCount == firstBytes.Length &&
                                (firstBytes[0] != (byte)'M' || firstBytes[1] != (byte)'Z'))
                            {
                                throw new InvalidDataException(
                                    "The downloaded file is not a Windows executable.");
                            }
                        }

                        await destination.WriteAsync(buffer.AsMemory(0, bytesRead), cancellation.Token);
                        bytesDownloaded += bytesRead;

                        if (DateTime.UtcNow - lastProgressUpdate > TimeSpan.FromMilliseconds(250))
                        {
                            lastProgressUpdate = DateTime.UtcNow;
                            if (contentLength is > 0)
                            {
                                InstallerProgressBar.IsIndeterminate = false;
                                InstallerProgressBar.Value =
                                    Math.Min(100, bytesDownloaded * 100d / contentLength.Value);
                                InstallerStatusTextBlock.Text =
                                    $"Downloading installer: {FormatBytes(bytesDownloaded)} of {FormatBytes(contentLength.Value)}";
                            }
                            else
                            {
                                InstallerStatusTextBlock.Text =
                                    $"Downloading installer: {FormatBytes(bytesDownloaded)}";
                            }
                        }
                    }

                    if (firstBytesCount < 2 ||
                        (contentLength.HasValue && bytesDownloaded != contentLength.Value))
                    {
                        throw new InvalidDataException("The installer download was incomplete.");
                    }

                    await destination.FlushAsync(cancellation.Token);
                    File.Move(partialPath, installerPath, true);

                    InstallerProgressBar.IsIndeterminate = false;
                    InstallerProgressBar.Value = 100;
                    InstallerStatusTextBlock.Text = $"Downloaded to {installerPath}";
                    StatusTextBlock.Text = "Installer downloaded. Waiting for your confirmation.";

                    var confirmation = MessageBox.Show(
                        this,
                        "The installer was downloaded over HTTPS, but the launcher cannot verify its publisher. Only run it if you trust the Hydrium CDN source. Run the installer now?",
                        "Run Hydrium installer?",
                        MessageBoxButton.YesNo,
                        MessageBoxImage.Warning);

                    if (confirmation == MessageBoxResult.Yes)
                    {
                        var process = Process.Start(new ProcessStartInfo
                        {
                            FileName = installerPath,
                            WorkingDirectory = installDirectory,
                            UseShellExecute = true
                        });
                        if (process == null)
                        {
                            throw new InvalidOperationException("Windows did not start the installer.");
                        }

                        StatusTextBlock.Text = "Hydrium installer started.";
                        InstallerStatusTextBlock.Text = "The installer is running. Follow its setup prompts.";
                    }
                }
                catch (OperationCanceledException)
                {
                    InstallerStatusTextBlock.Text = "Installer download canceled.";
                    StatusTextBlock.Text = "Installer download canceled.";
                }
            catch (HttpRequestException ex)
            {
                InstallerStatusTextBlock.Text = $"Download failed: {ex.Message}";
                StatusTextBlock.Text = "Could not download the Hydrium installer.";
            }
            catch (UnauthorizedAccessException ex)
            {
                InstallerStatusTextBlock.Text = $"Access denied: {ex.Message}";
                StatusTextBlock.Text = "Could not save or run the Hydrium installer.";
            }
            catch (IOException ex)
            {
                InstallerStatusTextBlock.Text = $"Download failed: {ex.Message}";
                StatusTextBlock.Text = "Could not save the Hydrium installer.";
            }
            catch (InvalidDataException ex)
            {
                InstallerStatusTextBlock.Text = ex.Message;
                StatusTextBlock.Text = "The Hydrium installer download was rejected.";
            }
            catch (System.ComponentModel.Win32Exception ex)
            {
                InstallerStatusTextBlock.Text = $"Could not start installer: {ex.Message}";
                StatusTextBlock.Text = "Could not start the Hydrium installer.";
            }
            catch (InvalidOperationException ex)
            {
                InstallerStatusTextBlock.Text = ex.Message;
                StatusTextBlock.Text = "Could not start the Hydrium installer.";
            }
            finally
            {
                try
                {
                    if (File.Exists(partialPath))
                    {
                        File.Delete(partialPath);
                    }
                }
                catch (IOException ex)
                {
                    InstallerStatusTextBlock.Text =
                        $"Could not remove the incomplete download: {ex.Message}";
                }
                catch (UnauthorizedAccessException ex)
                {
                    InstallerStatusTextBlock.Text =
                        $"Could not remove the incomplete download: {ex.Message}";
                }

                _installerCancellation = null;
                InstallGameButton.IsEnabled = true;
                CancelInstallButton.Visibility = Visibility.Collapsed;
                InstallerProgressBar.IsIndeterminate = false;
                if (_closeWhenInstallerStops)
                {
                    _closeWhenInstallerStops = false;
                    Close();
                }
            }
        }

        private void CancelInstallButton_Click(object sender, RoutedEventArgs e)
        {
            PlayClickSound();
            _installerCancellation?.Cancel();
        }

        private Uri? GetInstallerUri()
        {
            var configPath = Path.Combine(AppContext.BaseDirectory, "HydriumServerData.txt");
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(configPath));
                if (document.RootElement.TryGetProperty("GameInstaller", out var installerElement) &&
                    Uri.TryCreate(installerElement.GetString(), UriKind.Absolute, out var installerUri) &&
                    installerUri.Scheme == Uri.UriSchemeHttps &&
                    installerUri.Host.Equals("cdn.hydranet.dpdns.org", StringComparison.OrdinalIgnoreCase) &&
                    installerUri.AbsolutePath.Equals("/HydriumSetup.exe", StringComparison.OrdinalIgnoreCase))
                {
                    return installerUri;
                }

                InstallerStatusTextBlock.Visibility = Visibility.Visible;
                InstallerStatusTextBlock.Text = "The configured game installer URL is invalid.";
                return null;
            }
            catch (IOException ex)
            {
                InstallerStatusTextBlock.Visibility = Visibility.Visible;
                InstallerStatusTextBlock.Text = $"Could not read server configuration: {ex.Message}";
                return null;
            }
            catch (JsonException ex)
            {
                InstallerStatusTextBlock.Visibility = Visibility.Visible;
                InstallerStatusTextBlock.Text = $"Server configuration is invalid: {ex.Message}";
                return null;
            }
        }

        private static string FormatBytes(long bytes)
        {
            const double megabyte = 1024 * 1024;
            const double gigabyte = megabyte * 1024;
            return bytes >= gigabyte
                ? $"{bytes / gigabyte:F2} GB"
                : $"{bytes / megabyte:F0} MB";
        }

        private void ScreenModeButton_Click(object sender, RoutedEventArgs e)
        {
            _isVrMode = false;
            UpdateModeButtons();
            PlayClickSound();
        }

        private void VrModeButton_Click(object sender, RoutedEventArgs e)
        {
            _isVrMode = true;
            UpdateModeButtons();
            PlayClickSound();
        }

        private void UpdateModeButtons()
        {
            var active = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromRgb(78, 145, 232));
            var inactive = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromRgb(40, 59, 85));
            ScreenModeButton.Background = _isVrMode ? inactive : active;
            VrModeButton.Background = _isVrMode ? active : inactive;
        }

        private void LaunchGameButton_Click(object sender, RoutedEventArgs e)
        {
            PlayClickSound();

            if (!IsValidGamePath(GamePath) || !File.Exists(GamePath))
            {
                StatusTextBlock.Text = "Hydrium was not found. Use Find Game after installing it at C:\\Hydrium.";
                MessageBox.Show(
                    "Hydrium could not be found at C:\\Hydrium\\RecRoom.exe. Install it there, then choose Find Game.",
                    "Game not found",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
                return;
            }

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = GamePath,
                    WorkingDirectory = Path.GetDirectoryName(GamePath)!,
                    Arguments = _isVrMode ? "-vr" : "-windowed",
                    UseShellExecute = true
                };
                var gameProcess = Process.Start(startInfo);
                if (gameProcess == null)
                {
                    StatusTextBlock.Text = "Windows did not start Hydrium.";
                    return;
                }

                StatusTextBlock.Text = _isVrMode
                    ? "Launching Hydrium in VR mode..."
                    : "Launching Hydrium in screen mode...";

                if (CloseLauncherCheckBox.IsChecked == true)
                {
                    Close();
                }
            }
            catch (System.ComponentModel.Win32Exception ex)
            {
                StatusTextBlock.Text = $"Could not launch Hydrium: {ex.Message}";
                MessageBox.Show(
                    $"Failed to launch Hydrium: {ex.Message}",
                    "Launch error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }

        private static bool IsValidGamePath(string path)
        {
            return string.Equals(
                Path.GetFullPath(path),
                GamePath,
                StringComparison.OrdinalIgnoreCase);
        }
    }
}
