using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;

namespace Hydrlauncher
{
    public partial class LoginWindow : Window
    {
        private static readonly HttpClient HttpClient = new()
        {
            Timeout = TimeSpan.FromSeconds(20)
        };

        private readonly Uri _apiBaseUri;

        public string Username { get; private set; } = string.Empty;
        public string DisplayName { get; private set; } = string.Empty;
        public string RoleLabel { get; private set; } = "Role unavailable";
        public bool IsDeveloper { get; private set; }

        public LoginWindow()
        {
            InitializeComponent();

            try
            {
                _apiBaseUri = LoadApiBaseUri();
                SignInStatusTextBlock.Text = $"Sign in through {_apiBaseUri.Host}.";
            }
            catch (Exception ex) when (ex is IOException || ex is JsonException || ex is InvalidDataException)
            {
                _apiBaseUri = new Uri("https://invalid.invalid");
                SignInButton.IsEnabled = false;
                SignInStatusTextBlock.Text = ex.Message;
            }
        }

        private static Uri LoadApiBaseUri()
        {
            var configPath = Path.Combine(AppContext.BaseDirectory, "HydriumServerData.txt");
            if (!File.Exists(configPath))
            {
                throw new IOException("HydriumServerData.txt is missing. Sign-in is unavailable.");
            }

            using var document = JsonDocument.Parse(File.ReadAllText(configPath));
            if (!document.RootElement.TryGetProperty("API", out var apiElement) ||
                !Uri.TryCreate(apiElement.GetString(), UriKind.Absolute, out var apiUri) ||
                apiUri.Scheme != Uri.UriSchemeHttps)
            {
                throw new InvalidDataException("Server configuration needs a valid HTTPS API URL.");
            }

            return new Uri(apiUri.AbsoluteUri.TrimEnd('/') + "/", UriKind.Absolute);
        }

        private async void SignInButton_Click(object sender, RoutedEventArgs e)
        {
            var username = UsernameTextBox.Text.Trim();
            var password = PasswordBox.Password;
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrEmpty(password))
            {
                SignInStatusTextBlock.Text = "Enter both your username and password.";
                return;
            }

            SignInButton.IsEnabled = false;
            SignInStatusTextBlock.Text = "Signing in securely...";

            try
            {
                using var requestContent = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("grant_type", "password"),
                    new KeyValuePair<string, string>("username", username),
                    new KeyValuePair<string, string>("password", password)
                });

                using var response = await HttpClient.PostAsync(
                    new Uri(_apiBaseUri, "connect/token"),
                    requestContent);

                if (response.StatusCode == HttpStatusCode.Unauthorized ||
                    response.StatusCode == HttpStatusCode.BadRequest)
                {
                    SignInStatusTextBlock.Text = "Username or password is incorrect.";
                    return;
                }

                if (!response.IsSuccessStatusCode)
                {
                    SignInStatusTextBlock.Text = $"Sign-in service returned HTTP {(int)response.StatusCode}. Try again later.";
                    return;
                }

                var tokenResponse = await response.Content.ReadFromJsonAsync<TokenResponse>();
                if (string.IsNullOrWhiteSpace(tokenResponse?.AccessToken))
                {
                    SignInStatusTextBlock.Text = "The sign-in service returned an invalid response.";
                    return;
                }

                var profile = await LoadAccountProfileAsync(tokenResponse.AccessToken);
                if (profile == null || profile.AccountId <= 0)
                {
                    SignInStatusTextBlock.Text = "Your credentials were accepted, but the account profile could not be loaded.";
                    return;
                }

                Username = string.IsNullOrWhiteSpace(profile.Username) ? username : profile.Username;
                DisplayName = string.IsNullOrWhiteSpace(profile.DisplayName) ? Username : profile.DisplayName;

                bool? developerRole;
                try
                {
                    developerRole = await LoadDeveloperRoleAsync(
                        tokenResponse.AccessToken,
                        profile.AccountId);
                }
                catch (HttpRequestException)
                {
                    developerRole = null;
                }
                catch (TaskCanceledException)
                {
                    developerRole = null;
                }
                catch (JsonException)
                {
                    developerRole = null;
                }
                if (developerRole.HasValue)
                {
                    IsDeveloper = developerRole.Value;
                    RoleLabel = IsDeveloper ? "Role: Developer" : "Role: Player";
                }

                SignInStatusTextBlock.Text = developerRole.HasValue
                    ? "Signed in successfully."
                    : "Signed in, but the account role could not be verified.";

                DialogResult = true;
            }
            catch (HttpRequestException)
            {
                SignInStatusTextBlock.Text = "Could not reach the Hydrium API. Check your internet connection and try again.";
            }
            catch (TaskCanceledException)
            {
                SignInStatusTextBlock.Text = "The Hydrium API request timed out. Try again.";
            }
            catch (JsonException)
            {
                SignInStatusTextBlock.Text = "The Hydrium API returned an invalid response.";
            }
            finally
            {
                PasswordBox.Clear();
                SignInButton.IsEnabled = true;
            }
        }

        private async Task<AccountProfile?> LoadAccountProfileAsync(string accessToken)
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                new Uri(_apiBaseUri, "account/me"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using var response = await HttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            return await response.Content.ReadFromJsonAsync<AccountProfile>();
        }

        private async Task<bool?> LoadDeveloperRoleAsync(string accessToken, long accountId)
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                new Uri(_apiBaseUri, $"role/developer/{accountId}"));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            using var response = await HttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            return await response.Content.ReadFromJsonAsync<bool>();
        }

        private void CancelButton_Click(object sender, RoutedEventArgs e)
        {
            DialogResult = false;
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed)
            {
                DragMove();
            }
        }

        private sealed class TokenResponse
        {
            [JsonPropertyName("access_token")]
            public string? AccessToken { get; init; }
        }

        private sealed class AccountProfile
        {
            [JsonPropertyName("accountId")]
            public long AccountId { get; init; }

            [JsonPropertyName("username")]
            public string? Username { get; init; }

            [JsonPropertyName("displayName")]
            public string? DisplayName { get; init; }
        }
    }
}
