// =====================================================================
// script.js — Movie Watchlist (Supabase)
// Sections:
//   1.  Supabase Config & Initialization
//   2.  App State
//   3.  DOM References
//   4.  Helpers (toast, loading, avatar fallback)
//   5.  Auth — Sign Up, Sign In, Sign Out
//   6.  Auth State Observer (session persistence)
//   7.  Profile — Load, Save, Avatar Upload
//   8.  Movies — fetch + real-time subscription
//   9.  Movies — Add (with optional poster upload)
//  10.  Movies — Remove, Toggle Watched, Clear All
//  11.  Render — Movie list, genre pills
//  12.  Filter & Search
//  13.  Init
// =====================================================================


// ---- 1. Supabase Config & Initialization ----
// Replace these two values with your project's URL and anon key.
// Find them in: Supabase Dashboard → Project Settings → API
const SUPABASE_URL      = 'https://fbvzmkzcgynoqkktnkja.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZidnpta3pjZ3lub3Fra3Rua2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjcwNDcsImV4cCI6MjA5MDAwMzA0N30.QW1JNmFRaX7fMYZjgjLGjDIpu1YsWZUxtuouqIHSdCU';

// Detect un-filled placeholders and surface a clear message immediately
if (SUPABASE_URL.includes('YOUR_') || SUPABASE_ANON_KEY.includes('YOUR_')) {
  document.addEventListener('DOMContentLoaded', () => {
    const errEl = document.getElementById('auth-error');
    if (errEl) {
      errEl.textContent =
        '⚠️ Supabase is not configured. Open script.js and replace ' +
        'SUPABASE_URL and SUPABASE_ANON_KEY with your project credentials. ' +
        'See README.md for step-by-step instructions.';
      errEl.classList.remove('hidden');
    }
  });
}

// createClient is exposed as window.supabase.createClient by the CDN build
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ---- 2. App State ----
let movies        = [];     // in-memory cache, kept in sync by the real-time channel
let activeFilter  = 'all';  // 'all' | 'watched' | 'unwatched'
let activeGenre   = null;   // null = show all genres
let searchQuery   = '';     // current search string
let currentUser   = null;   // Supabase User object
let moviesChannel = null;   // Supabase real-time channel handle
let toastTimer    = null;   // debounce handle for toast auto-hide


// ---- 3. DOM References ----
// Auth
const authSection    = document.getElementById('auth-section');
const signinForm     = document.getElementById('signin-form');
const signupForm     = document.getElementById('signup-form');
const signinEmail    = document.getElementById('signin-email');
const signinPassword = document.getElementById('signin-password');
const signupName     = document.getElementById('signup-name');
const signupEmail    = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const authError      = document.getElementById('auth-error');
const authTabs       = document.querySelectorAll('.auth-tab');

// App shell
const appSection      = document.getElementById('app');
const headerAvatar    = document.getElementById('header-avatar');
const headerName      = document.getElementById('header-name');
const logoutBtn       = document.getElementById('logout-btn');
const movieCountBadge = document.getElementById('movie-count');
const loadingOverlay  = document.getElementById('loading-overlay');
const toast           = document.getElementById('toast');

// Profile modal
const profileModal         = document.getElementById('profile-modal');
const profileTrigger       = document.getElementById('profile-trigger');
const closeProfileBtn      = document.getElementById('close-profile');
const profileAvatar        = document.getElementById('profile-avatar');
const profileName          = document.getElementById('profile-name');
const profileEmail         = document.getElementById('profile-email');
const saveProfileBtn       = document.getElementById('save-profile-btn');
const profileMsg           = document.getElementById('profile-msg');
const avatarUploadInput    = document.getElementById('avatar-upload');
const avatarUploadProgress = document.getElementById('avatar-upload-progress');
const avatarProgressFill   = document.getElementById('avatar-progress-fill');

// Movie form
const movieTitleInput  = document.getElementById('movie-title');
const movieGenreInput  = document.getElementById('movie-genre');
const movieTagsInput   = document.getElementById('movie-tags');
const movieNotesInput  = document.getElementById('movie-notes');
const moviePosterInput = document.getElementById('movie-poster');
const posterNameEl     = document.getElementById('poster-name');
const addBtn           = document.getElementById('add-btn');
const errorMsg         = document.getElementById('error-msg');

// List & filters
const movieList   = document.getElementById('movie-list');
const emptyMsg    = document.getElementById('empty-msg');
const clearBtn    = document.getElementById('clear-btn');
const filterTabs  = document.querySelectorAll('.tab');
const genrePills  = document.getElementById('genre-pills');
const searchInput = document.getElementById('search-input');


// ---- 4. Helpers ----

/** Show a brief toast notification that auto-dismisses after 3 s. */
function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

/** Show/hide the full-screen loading spinner. */
function setLoading(visible) {
  loadingOverlay.style.display = visible ? 'flex' : 'none';
}

/**
 * Generate an SVG data URI with the user's initial on a coloured circle.
 * Used as avatar fallback when no photo has been uploaded.
 */
function avatarFallback(name) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const palette = ['#7c6af7', '#4caf82', '#e05555', '#f4a261', '#457b9d'];
  const fill    = palette[initial.charCodeAt(0) % palette.length];
  return (
    `data:image/svg+xml,` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>` +
    `<circle cx='20' cy='20' r='20' fill='${encodeURIComponent(fill)}'/>` +
    `<text x='20' y='26' text-anchor='middle' font-family='system-ui' ` +
    `font-size='18' font-weight='bold' fill='white'>${initial}</text></svg>`
  );
}

/** Set all avatar <img> elements to a URL (or generated fallback if empty). */
function setAvatarSrc(url, name) {
  const src = url || avatarFallback(name);
  headerAvatar.src  = src;
  profileAvatar.src = src;
}

/** Map Supabase error messages to friendly UI strings. */
function friendlyAuthError(message) {
  if (!message) return 'Something went wrong. Please try again.';
  if (message.includes('Invalid login credentials'))   return 'Incorrect email or password.';
  if (message.includes('Email not confirmed'))         return 'Please confirm your email first, then sign in.';
  if (message.includes('User already registered'))     return 'An account with that email already exists.';
  if (message.includes('Password should be at least')) return 'Password must be at least 6 characters.';
  if (message.includes('Unable to validate email'))    return 'Please enter a valid email address.';
  if (message.includes('signup is disabled'))          return 'Sign-ups are currently disabled on this project.';
  return message;
}


// ---- 5. Auth ----

/** Switch between Sign In and Sign Up tabs. */
authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    signinForm.classList.toggle('hidden', target !== 'signin');
    signupForm.classList.toggle('hidden', target !== 'signup');
    authError.classList.add('hidden');
  });
});

/** Show an error/info message inside the auth card. */
function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove('hidden');
}

/** Email / password sign-in. */
signinForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.classList.add('hidden');
  setLoading(true);

  const { error } = await supabase.auth.signInWithPassword({
    email:    signinEmail.value.trim(),
    password: signinPassword.value,
  });

  if (error) {
    setLoading(false);
    showAuthError(friendlyAuthError(error.message));
  }
  // On success, onAuthStateChange fires automatically and transitions the UI
});

/** Email / password sign-up. */
signupForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.classList.add('hidden');
  setLoading(true);

  const { data, error } = await supabase.auth.signUp({
    email:    signupEmail.value.trim(),
    password: signupPassword.value,
    options: {
      // Pass display_name in user metadata; used by the DB trigger to create the profile row
      data: { display_name: signupName.value.trim() },
    },
  });

  if (error) {
    setLoading(false);
    showAuthError(friendlyAuthError(error.message));
    return;
  }

  if (data.session) {
    // Email confirmation is disabled — user is immediately signed in.
    // onAuthStateChange will fire and handle the UI transition; nothing to do here.
    return;
  }

  // Email confirmation is required (Supabase default) — session is null until confirmed.
  setLoading(false);
  showAuthError('✉️ Check your email to confirm your account, then sign in.');
  // Switch to sign-in tab so they can sign in after confirming
  authTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'signin'));
  signinForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
});

/** Sign out: detach real-time channel, reset state, show auth screen. */
logoutBtn.addEventListener('click', async () => {
  if (moviesChannel) {
    supabase.removeChannel(moviesChannel);
    moviesChannel = null;
  }
  movies      = [];
  currentUser = null;
  await supabase.auth.signOut();
  showToast('Signed out.');
});


// ---- 6. Auth State Observer (session persistence) ----
// Supabase automatically saves the session to localStorage and restores it on
// every page load. onAuthStateChange fires with event 'INITIAL_SESSION' on
// first load, 'SIGNED_IN' after login, and 'SIGNED_OUT' after logout.
supabase.auth.onAuthStateChange(async (event, session) => {
  // TOKEN_REFRESHED fires silently every ~60 min — no UI work needed.
  if (event === 'TOKEN_REFRESHED') return;

  if (session && session.user) {
    currentUser = session.user;

    // Show the app immediately — don't block on network requests.
    authSection.classList.add('hidden');
    appSection.classList.remove('hidden');
    setLoading(false);
    movieTitleInput.focus();

    // Load profile and movies in parallel after the UI is already visible.
    loadUserProfile(session.user);
    attachMoviesListener(session.user.id);
  } else {
    // No session — show auth screen.
    appSection.classList.add('hidden');
    authSection.classList.remove('hidden');
    setLoading(false);
  }
});


// ---- 7. Profile ----

/**
 * Fetch the user's profile row from the `profiles` table and populate the UI.
 * Falls back to the email address if no display name has been set yet.
 */
async function loadUserProfile(user) {
  let name = user.email || 'You';
  let url  = '';

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      name = data.display_name || name;
      url  = data.avatar_url   || '';
    }
  } catch (err) {
    // profiles table may not exist yet — fall back to email as display name
    console.warn('Could not load profile:', err.message);
  }

  headerName.textContent = name;
  setAvatarSrc(url, name);
  profileName.value  = name;
  profileEmail.value = user.email || '';
}

/** Open the profile modal. */
profileTrigger.addEventListener('click', () => {
  profileModal.classList.remove('hidden');
});

/** Close the profile modal (button or backdrop click). */
closeProfileBtn.addEventListener('click', () => {
  profileModal.classList.add('hidden');
  profileMsg.classList.add('hidden');
});
profileModal.addEventListener('click', e => {
  if (e.target === profileModal) profileModal.classList.add('hidden');
});

/** Save display name to the `profiles` table. */
saveProfileBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  const name = profileName.value.trim();
  if (!name) return;

  saveProfileBtn.disabled = true;

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: currentUser.id, display_name: name, updated_at: new Date().toISOString() });

  if (!error) {
    headerName.textContent = name;
    setAvatarSrc(headerAvatar.src, name);
    profileMsg.textContent = 'Profile saved!';
    profileMsg.classList.remove('hidden');
    setTimeout(() => profileMsg.classList.add('hidden'), 3000);
    showToast('Profile saved!');
  } else {
    profileMsg.textContent = 'Failed to save. Please try again.';
    profileMsg.classList.remove('hidden');
  }

  saveProfileBtn.disabled = false;
});

/**
 * Upload a new avatar to Supabase Storage (bucket: avatars) under the path
 * {userId}/avatar, then save the public URL back to the profiles table.
 */
avatarUploadInput.addEventListener('change', async () => {
  const file = avatarUploadInput.files[0];
  if (!file || !currentUser) return;

  avatarUploadProgress.classList.remove('hidden');
  avatarProgressFill.style.width = '40%';

  const filePath = `${currentUser.id}/avatar`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    avatarUploadProgress.classList.add('hidden');
    avatarProgressFill.style.width = '0%';
    showToast('Avatar upload failed.');
    avatarUploadInput.value = '';
    return;
  }

  // Get the permanent public URL (cache-busted so the browser reloads the image)
  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
  const url = urlData.publicUrl + '?t=' + Date.now();

  await supabase
    .from('profiles')
    .upsert({ id: currentUser.id, avatar_url: url, updated_at: new Date().toISOString() });

  setAvatarSrc(url, profileName.value);
  avatarProgressFill.style.width = '100%';
  setTimeout(() => {
    avatarUploadProgress.classList.add('hidden');
    avatarProgressFill.style.width = '0%';
  }, 800);
  avatarUploadInput.value = '';
  showToast('Avatar updated!');
});


// ---- 8. Movies — Fetch + Real-time Subscription ----

/**
 * Load all movies for the current user, then open a Supabase real-time channel
 * so any INSERT / UPDATE / DELETE on the `movies` table re-fetches the list.
 */
function attachMoviesListener(userId) {
  if (moviesChannel) supabase.removeChannel(moviesChannel);

  // Initial data load
  fetchMovies(userId);

  // Real-time updates — fires on any change to the user's rows
  moviesChannel = supabase
    .channel(`movies:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'movies', filter: `user_id=eq.${userId}` },
      () => fetchMovies(userId)
    )
    .subscribe();
}

/** Query all movies for userId ordered newest-first, then re-render. */
async function fetchMovies(userId) {
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!error && data) {
    movies = data;
    render();
  }
}


// ---- 9. Movies — Add (with optional poster upload) ----

/** Show the chosen poster filename next to the upload button. */
moviePosterInput.addEventListener('change', () => {
  const file = moviePosterInput.files[0];
  posterNameEl.textContent = file ? `📎 ${file.name}` : '';
  posterNameEl.classList.toggle('hidden', !file);
});

/**
 * Validate the form, optionally upload a poster to Supabase Storage,
 * then insert a row into the `movies` table.
 */
async function addMovie() {
  const title = movieTitleInput.value.trim();
  if (!title) {
    errorMsg.classList.remove('hidden');
    movieTitleInput.focus();
    return;
  }
  if (!currentUser) return;

  errorMsg.classList.add('hidden');
  addBtn.disabled = true;

  // Parse comma-separated tags into a trimmed array
  const tags = movieTagsInput.value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  // Optional poster upload (bucket: posters, path: {userId}/{uniqueId})
  let posterUrl = '';
  const posterFile = moviePosterInput.files[0];
  if (posterFile) {
    const uniqueId = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filePath = `${currentUser.id}/${uniqueId}`;

    const { error: uploadError } = await supabase.storage
      .from('posters')
      .upload(filePath, posterFile, { contentType: posterFile.type });

    if (!uploadError) {
      const { data } = supabase.storage.from('posters').getPublicUrl(filePath);
      posterUrl = data.publicUrl;
    } else {
      showToast('Poster upload failed — movie saved without image.');
    }
  }

  const { error } = await supabase.from('movies').insert({
    user_id:    currentUser.id,
    title,
    genre:      movieGenreInput.value,
    tags,
    notes:      movieNotesInput.value.trim(),
    poster_url: posterUrl,
    watched:    false,
  });

  if (error) {
    showToast('Failed to add movie. Please try again.');
  } else {
    // Reset the form
    movieTitleInput.value  = '';
    movieGenreInput.value  = '';
    movieTagsInput.value   = '';
    movieNotesInput.value  = '';
    moviePosterInput.value = '';
    posterNameEl.classList.add('hidden');
    movieTitleInput.focus();
    setFilter('all');
    showToast('Movie added!');
    // Refresh immediately — don't wait for real-time
    fetchMovies(currentUser.id);
  }

  addBtn.disabled = false;
}

addBtn.addEventListener('click', addMovie);

movieTitleInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') addMovie();
});

movieTitleInput.addEventListener('input', () => {
  if (movieTitleInput.value.trim()) errorMsg.classList.add('hidden');
});


// ---- 10. Movies — Remove, Toggle Watched, Clear All ----

/** Delete a single movie row from Supabase. */
async function removeMovie(id) {
  const { error } = await supabase.from('movies').delete().eq('id', id);
  if (error) {
    showToast('Failed to remove movie.');
  } else {
    showToast('Movie removed.');
    // Refresh immediately — don't wait for real-time (it requires extra Supabase setup)
    fetchMovies(currentUser.id);
  }
}

/** Flip the watched boolean on a movie row. */
async function toggleWatched(id, current) {
  const { error } = await supabase
    .from('movies')
    .update({ watched: !current })
    .eq('id', id);
  if (error) {
    showToast('Failed to update movie.');
  } else {
    fetchMovies(currentUser.id);
  }
}

/** Delete all of the current user's movies after confirmation. */
clearBtn.addEventListener('click', async () => {
  if (!currentUser) return;
  if (!confirm('Clear your entire watchlist? This cannot be undone.')) return;

  const { error } = await supabase
    .from('movies')
    .delete()
    .eq('user_id', currentUser.id);

  if (error) {
    showToast('Failed to clear watchlist.');
  } else {
    showToast('Watchlist cleared.');
    fetchMovies(currentUser.id);
  }
});


// ---- 11. Render ----

/**
 * Return the subset of movies that match the active status filter,
 * active genre pill, and search query.
 */
function getFiltered() {
  return movies.filter(m => {
    if (activeFilter === 'watched'   && !m.watched) return false;
    if (activeFilter === 'unwatched' &&  m.watched) return false;
    if (activeGenre && m.genre !== activeGenre)     return false;

    if (searchQuery) {
      const q       = searchQuery.toLowerCase();
      const inTitle = m.title.toLowerCase().includes(q);
      const inGenre = m.genre  && m.genre.toLowerCase().includes(q);
      const inTags  = m.tags   && m.tags.some(t => t.toLowerCase().includes(q));
      const inNotes = m.notes  && m.notes.toLowerCase().includes(q);
      if (!inTitle && !inGenre && !inTags && !inNotes) return false;
    }

    return true;
  });
}

/** Re-render the movie list and all supporting UI elements. */
function render() {
  const filtered = getFiltered();

  movieList.innerHTML = '';

  if (filtered.length === 0) {
    emptyMsg.classList.remove('hidden');
  } else {
    emptyMsg.classList.add('hidden');
    filtered.forEach(m => movieList.appendChild(createMovieCard(m)));
  }

  const total = movies.length;
  movieCountBadge.textContent = `${total} ${total === 1 ? 'movie' : 'movies'}`;
  clearBtn.classList.toggle('hidden', movies.length === 0);
  renderGenrePills();
}

/**
 * Build and return a <li> card element for a single movie.
 * Supabase returns snake_case column names (poster_url, user_id, etc.).
 */
function createMovieCard(movie) {
  const li = document.createElement('li');
  li.className = `movie-card${movie.watched ? ' watched' : ''}`;
  li.dataset.id = movie.id;

  // Watched checkbox
  const checkbox     = document.createElement('input');
  checkbox.type      = 'checkbox';
  checkbox.className = 'watch-checkbox';
  checkbox.checked   = !!movie.watched;
  checkbox.title     = movie.watched ? 'Mark as unwatched' : 'Mark as watched';
  checkbox.addEventListener('change', () => toggleWatched(movie.id, movie.watched));
  li.appendChild(checkbox);

  // Optional poster thumbnail (Supabase column: poster_url)
  if (movie.poster_url) {
    const thumb       = document.createElement('img');
    thumb.src         = movie.poster_url;
    thumb.alt         = movie.title + ' poster';
    thumb.className   = 'movie-poster-thumb';
    thumb.loading     = 'lazy';
    li.appendChild(thumb);
  }

  // Text info block
  const info = document.createElement('div');
  info.className = 'movie-info';

  const titleEl       = document.createElement('p');
  titleEl.className   = 'movie-title';
  titleEl.textContent = movie.title;
  info.appendChild(titleEl);

  if (movie.genre) {
    const genreEl       = document.createElement('p');
    genreEl.className   = 'movie-genre';
    genreEl.textContent = movie.genre;
    info.appendChild(genreEl);
  }

  if (movie.tags && movie.tags.length > 0) {
    const tagRow = document.createElement('div');
    tagRow.className = 'movie-tags';
    movie.tags.forEach(tag => {
      const pill       = document.createElement('span');
      pill.className   = 'movie-tag';
      pill.textContent = tag;
      pill.addEventListener('click', () => {
        searchInput.value = tag;
        searchQuery       = tag.toLowerCase();
        render();
      });
      tagRow.appendChild(pill);
    });
    info.appendChild(tagRow);
  }

  if (movie.notes) {
    const notesEl       = document.createElement('p');
    notesEl.className   = 'movie-notes';
    notesEl.textContent = movie.notes;
    info.appendChild(notesEl);
  }

  const removeBtn       = document.createElement('button');
  removeBtn.className   = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.title       = 'Remove from watchlist';
  removeBtn.addEventListener('click', () => removeMovie(movie.id));

  li.appendChild(info);
  li.appendChild(removeBtn);

  return li;
}

/** Rebuild the genre filter pills from the unique genres currently in the list. */
function renderGenrePills() {
  genrePills.innerHTML = '';

  const genres = [...new Set(movies.map(m => m.genre).filter(Boolean))].sort();
  if (genres.length === 0) return;

  genres.forEach(genre => {
    const pill       = document.createElement('button');
    pill.className   = `genre-pill${activeGenre === genre ? ' active' : ''}`;
    pill.textContent = genre;
    pill.addEventListener('click', () => {
      activeGenre = activeGenre === genre ? null : genre;
      render();
    });
    genrePills.appendChild(pill);
  });
}


// ---- 12. Filter & Search ----

function setFilter(filter) {
  activeFilter = filter;
  filterTabs.forEach(tab =>
    tab.classList.toggle('active', tab.dataset.filter === filter)
  );
}

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    setFilter(tab.dataset.filter);
    render();
  });
});

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
});


// ---- 13. Init ----
// Supabase's onAuthStateChange fires with the restored session automatically.
// Keep the loading overlay visible until that first callback completes.
setLoading(true);

// Safety net: if the Supabase session check hasn't resolved within 5 seconds
// (e.g. slow CDN or network), stop blocking the UI and show the auth screen.
setTimeout(() => {
  if (loadingOverlay.style.display !== 'none') {
    setLoading(false);
    authSection.classList.remove('hidden');
    appSection.classList.add('hidden');
  }
}, 5000);
