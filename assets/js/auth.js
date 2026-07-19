/* ============================================================
   CLEARROUTE UK — AUTHENTICATION
   ============================================================ */

const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW = 60000;
let loginAttempts = [];

function isLoginRateLimited() {
  const now = Date.now();
  loginAttempts = loginAttempts.filter(t => t > now - LOGIN_RATE_WINDOW);
  if (loginAttempts.length >= LOGIN_RATE_LIMIT) return true;
  loginAttempts.push(now);
  return false;
}

document.addEventListener('DOMContentLoaded', async () => {
  let supabase;
  try {
    supabase = await window.getSupabase();
  } catch {
    const el = document.querySelector('.auth-form-wrapper');
    if (el) el.innerHTML = '<div style="color:#EF4444;text-align:center;padding:40px;">Failed to load authentication service. Please refresh the page.</div>';
    return;
  }
  
  // Check if user is already logged in — show info instead of auto-redirect
  // so they can still log in with a different account
  const { data: { session } } = await supabase.auth.getSession();
  if (session && (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html'))) {
    const isAdmin = window.isAdminEmail?.(session.user.email);
    const target = isAdmin ? 'admin/index.html' : 'dashboard.html';
    const label = isAdmin ? 'Admin Panel' : 'Dashboard';
    const msgEl = document.querySelector('.auth-form-header p');
    if (msgEl) {
      msgEl.innerHTML = `Already signed in as <strong>${session.user.email}</strong>. ` +
        `<a href="${target}" style="color:var(--copper);font-weight:600;">Go to ${label} →</a>`;
    }
  }

  // Registration Form Handler
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const firstName = document.getElementById('firstName').value;
      const lastName = document.getElementById('lastName').value;
      const email = document.getElementById('email').value;
      const phone = document.getElementById('phone').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const terms = document.getElementById('terms').checked;
      
      const errorDiv = document.getElementById('authError');
      const successDiv = document.getElementById('authSuccess');
      const submitBtn = document.getElementById('registerBtn');
      
      errorDiv.textContent = '';
      successDiv.textContent = '';

      if (window.isAdminEmail?.(email)) {
        errorDiv.textContent = 'This email is reserved for admin use. Please use the admin panel to sign in.';
        return;
      }
      
      // Validation
      if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
      }
      
      if (!terms) {
        errorDiv.textContent = 'You must agree to the Terms of Service and Privacy Policy';
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';
      
      try {
        // Register user with Supabase
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              phone: phone,
              full_name: `${firstName} ${lastName}`
            }
          }
        });
        
        if (error) throw error;
        
        // Create profile row immediately (regardless of DB trigger)
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`,
          phone,
          is_admin: false,
          created_at: new Date().toISOString()
        });
        if (profileError) console.warn('Profile upsert warning:', profileError);
        
        successDiv.textContent = 'Account created successfully! Redirecting to dashboard...';
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 2000);
        
      } catch (error) {
        errorDiv.textContent = error.message || 'An error occurred during registration';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
      }
    });
  }

  // Login Form Handler
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      const errorDiv = document.getElementById('authError');
      const successDiv = document.getElementById('authSuccess');
      const submitBtn = document.getElementById('loginBtn');
      
      errorDiv.textContent = '';
      successDiv.textContent = '';

      if (window.isAdminEmail?.(email)) {
        errorDiv.textContent = 'This account uses the admin panel. Please sign in at /admin/';
        return;
      }

      if (isLoginRateLimited()) {
        errorDiv.textContent = 'Too many login attempts. Please wait before trying again.';
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
      
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (error) throw error;
        
        successDiv.textContent = 'Login successful! Redirecting to dashboard...';
        
        // Verify session was created before redirecting
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          // Fallback: manually set from signIn response
          if (data?.session) {
            await supabase.auth.setSession(data.session);
          }
        }
        
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1000);
        
      } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message || 'Invalid email or password';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
      }
    });
  }

  // Forgot Password Handler
  const forgotPasswordLink = document.getElementById('forgotPassword');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      
      if (!email) {
        alert('Please enter your email address first');
        return;
      }
      
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password.html`
        });
        
        if (error) throw error;
        
        alert('Password reset email sent! Check your inbox for instructions.');
      } catch (error) {
        alert('Error sending reset email: ' + error.message);
      }
    });
  }
});

// Logout function (can be called from other pages)
async function logout() {
  try {
    const supabase = await window.getSupabase();
    await supabase.auth.signOut();
  } catch {}
  window.location.href = 'login.html';
}

// Get current user
async function getCurrentUser() {
  try {
    const supabase = await window.getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

// Check if user is authenticated
async function isAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}

// Toggle password visibility (eye icon)
function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const icon = btnEl.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) { icon.className = 'fas fa-eye-slash'; }
  } else {
    input.type = 'password';
    if (icon) { icon.className = 'fas fa-eye'; }
  }
}
