/* ============================================================
   CLEARROUTE UK — DASHBOARD FUNCTIONALITY
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const supabase = await window.getSupabase();
    
    if (!supabase) {
      console.error('Supabase not initialized');
      showErrorMessage('Database connection error. Please check your configuration.');
      return;
    }
    
    // Check authentication
    let { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Session error:', error);
      showErrorMessage('Authentication error. Please try logging in again.');
      return;
    }
    
    // Fallback: try getUser if getSession returned no session
    if (!session) {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) {
        window.location.href = 'login.html';
        return;
      }
      // Reconstruct minimal session-like object from user
      session = { user };
    }

    // Load user profile
    await loadUserProfile(supabase, session.user.id);
    
    // Load applications
    await loadApplications(supabase, session.user.id);
    
    // Navigation handling
    setupNavigation();
    
    // Logout handler
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = 'login.html';
    });
    
    // Service selection handlers
    document.querySelectorAll('.select-service-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serviceCard = e.target.closest('.service-select-card');
        const service = serviceCard.dataset.service;
        window.location.href = `application-form.html?service=${service}`;
      });
    });
    
    // Profile form handler
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateProfile(supabase);
      });
    }
  } catch (error) {
    console.error('Dashboard initialization error:', error);
    showErrorMessage('Error loading dashboard. Please refresh the page.');
  }
});

function showErrorMessage(message) {
  const dashboardContent = document.querySelector('.dashboard-content');
  if (dashboardContent) {
    dashboardContent.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #EF4444; margin-bottom: 20px;"></i>
        <h2 style="color: #1A1A2E; margin-bottom: 12px;">Error</h2>
        <p style="color: #6B7280; margin-bottom: 24px;">${message}</p>
        <a href="login.html" class="btn btn-primary">Go to Login</a>
      </div>
    `;
  }
}

async function loadUserProfile(supabase, userId) {
  try {
    // Get auth user data as fallback
    const { data: { user } } = await supabase.auth.getUser();
    
    // Try to get profile from database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    // Use profile data if available, otherwise use auth user data
    const firstName = profile?.first_name || user?.user_metadata?.first_name || '';
    const lastName = profile?.last_name || user?.user_metadata?.last_name || '';
    const fullName = profile?.full_name || user?.user_metadata?.full_name || `${firstName} ${lastName}`.trim() || 'User';
    const email = profile?.email || user?.email || '';
    const phone = profile?.phone || user?.user_metadata?.phone || '';
    
    // Update header user info
    document.getElementById('userName').textContent = fullName || 'User';
    document.getElementById('userEmail').textContent = email || '';
    document.getElementById('welcomeName').textContent = firstName || 'User';
    
    // Populate profile form
    const profileFirstName = document.getElementById('profileFirstName');
    const profileLastName = document.getElementById('profileLastName');
    const profileEmail = document.getElementById('profileEmail');
    const profilePhone = document.getElementById('profilePhone');
    
    if (profileFirstName) profileFirstName.value = firstName;
    if (profileLastName) profileLastName.value = lastName;
    if (profileEmail) profileEmail.value = email;
    if (profilePhone) profilePhone.value = phone;
    
    // If profile doesn't exist in database, create it
    if (!profile && user) {
      try {
        await supabase.from('profiles').insert([{
          id: userId,
          email: email,
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          full_name: fullName,
          created_at: new Date().toISOString()
        }]);
        console.log('Profile created for user');
      } catch (insertError) {
        console.error('Error creating profile:', insertError);
      }
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

async function loadApplications(supabase, userId) {
  try {
    const { data: applications, error } = await supabase
      .from('applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Update stats
    const total = applications.length;
    const pending = applications.filter(app => ['pending', 'in_review', 'submitted'].includes(app.status)).length;
    const completed = applications.filter(app => app.status === 'approved').length;
    
    document.getElementById('totalApplications').textContent = total;
    document.getElementById('pendingApplications').textContent = pending;
    document.getElementById('completedApplications').textContent = completed;
    
    // Count actual uploaded documents (sum boolean fields, not rows)
    const { data: docs, error: docErr } = await supabase
      .from('application_documents')
      .select('passport_provided, address_proof_provided, additional_doc_provided')
      .in('application_id', applications.map(a => a.id));
    let totalDocs = 0;
    if (!docErr && docs) {
      docs.forEach(d => {
        if (d.passport_provided) totalDocs++;
        if (d.address_proof_provided) totalDocs++;
        if (d.additional_doc_provided) totalDocs++;
      });
    }
    document.getElementById('uploadedDocuments').textContent = docErr ? '—' : totalDocs;
    
    // Render applications
    renderApplications(applications);
    
    // Set up real-time subscription for application changes
    setupRealtimeSubscription(supabase, userId);
  } catch (error) {
    console.error('Error loading applications:', error);
  }
}

function setupRealtimeSubscription(supabase, userId) {
  // Subscribe to changes in the applications table for this user
  const subscription = supabase
    .channel('applications-changes')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'applications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        console.log('Application changed:', payload);
        // Reload applications when changes occur
        loadApplications(supabase, userId);
      }
    )
    .subscribe();
  
  // Store subscription reference for cleanup (optional)
  window.applicationsSubscription = subscription;
}

function renderApplications(applications) {
  const recentList = document.getElementById('recentApplicationsList');
  const allList = document.getElementById('allApplicationsList');
  
  if (applications.length === 0) {
    const emptyHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <p>No applications yet</p>
        <a href="#" class="btn btn-primary" data-section="new-application">
          <i class="fas fa-plus"></i> Start Your First Application
        </a>
      </div>
    `;
    recentList.innerHTML = emptyHTML;
    allList.innerHTML = emptyHTML;
    return;
  }
  
  const applicationsHTML = applications.map(app => `
    <div class="application-card">
      <div class="app-info">
        <div class="app-service">${getServiceName(app.service_type)}</div>
        <div class="app-id">ID: ${app.id.slice(0, 8)}...</div>
      </div>
      <div class="app-status">
        <span class="status-badge ${getStatusClass(app.status)}">${formatStatus(app.status)}</span>
        <span class="app-date">${formatDate(app.created_at)}</span>
      </div>
      <div class="app-actions">
        <a href="application-progress.html?id=${app.id}" class="btn btn-secondary btn-sm">
          <i class="fas fa-eye"></i> View
        </a>
      </div>
    </div>
  `).join('');
  
  recentList.innerHTML = applications.slice(0, 5).length > 0 
    ? applications.slice(0, 5).map(app => `
        <div class="application-card">
          <div class="app-info">
            <div class="app-service">${getServiceName(app.service_type)}</div>
            <div class="app-id">ID: ${app.id.slice(0, 8)}...</div>
          </div>
          <div class="app-status">
            <span class="status-badge ${getStatusClass(app.status)}">${formatStatus(app.status)}</span>
            <span class="app-date">${formatDate(app.created_at)}</span>
          </div>
          <div class="app-actions">
            <a href="application-progress.html?id=${app.id}" class="btn btn-secondary btn-sm">
              <i class="fas fa-eye"></i> View
            </a>
          </div>
        </div>
      `).join('')
    : '<div class="empty-state"><p>No recent applications</p></div>';
  
  allList.innerHTML = applicationsHTML;
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.dashboard-section');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      
      // Update nav
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update sections
      sections.forEach(sec => sec.classList.remove('active'));
      document.getElementById(`section-${section}`).classList.add('active');
    });
  });
  
  // Handle view all links
  document.querySelectorAll('.view-all').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      document.querySelector(`.nav-item[data-section="${section}"]`).click();
    });
  });
  
  // Handle empty state buttons
  document.querySelectorAll('.empty-state .btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const section = btn.dataset.section;
      document.querySelector(`.nav-item[data-section="${section}"]`).click();
    });
  });
}

async function updateProfile(supabase) {
  const firstName = document.getElementById('profileFirstName').value;
  const lastName = document.getElementById('profileLastName').value;
  const phone = document.getElementById('profilePhone').value;
  
  const { data: { user } } = await supabase.auth.getUser();
  
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        full_name: `${firstName} ${lastName}`
      })
      .eq('id', user.id);
    
    if (error) throw error;
    
    alert('Profile updated successfully!');
    location.reload();
  } catch (error) {
    alert('Error updating profile: ' + error.message);
  }
}

// Helper functions
function getServiceName(serviceType) {
  const services = {
    'driving-licence': 'Driving Licence Conversion',
    'ni-number': 'NI Number Application',
    'brp-evisa': 'BRP / eVisa Guidance',
    'theory-test': 'Theory Test Booking',
    'practical-test': 'Practical Test Booking',
    'address-proof': 'Address Proof Setup',
    'bank-account': 'UK Bank Account Setup'
  };
  return services[serviceType] || serviceType;
}

function getStatusClass(status) {
  const classes = {
    'pending': 'status-pending',
    'submitted': 'status-pending',
    'in_review': 'status-in-review',
    'approved': 'status-approved',
    'rejected': 'status-rejected',
    'completed': 'status-approved'
  };
  return classes[status] || 'status-pending';
}

function formatStatus(status) {
  const formatted = {
    'pending': 'Pending',
    'submitted': 'Submitted',
    'in_review': 'In Review',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'completed': 'Completed'
  };
  return formatted[status] || status;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
