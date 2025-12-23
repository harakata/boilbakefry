import React, { useState, useEffect } from 'react';
import { Search, Plus, ChefHat, Clock, Users, BookOpen, X, LogOut } from 'lucide-react';

// REPLACE THESE WITH YOUR SUPABASE KEYS
const SUPABASE_URL = 'https://tkwpaqauxtpvflzpydfn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrd3BhcWF1eHRwdmZsenB5ZGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MDgzMTYsImV4cCI6MjA4MjA4NDMxNn0.NlZOcfmV1j3Vl-0P74LzSnogAvkblZndNnICPtOVALM';

// Simple Supabase client (no npm package needed)
class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.headers = {
      'apikey': key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  async signUp(email, password) {
    const response = await fetch(`${this.url}/auth/v1/signup`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ email, password })
    });
    return await response.json();
  }

  async signIn(email, password) {
    const response = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ email, password })
    });
    return await response.json();
  }

  async signOut(accessToken) {
    const response = await fetch(`${this.url}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    return await response.json();
  }

  async getUser(accessToken) {
    const response = await fetch(`${this.url}/auth/v1/user`, {
      headers: {
        ...this.headers,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    return await response.json();
  }

  async isAdmin(email, accessToken) {
    const response = await fetch(
      `${this.url}/rest/v1/admins?email=eq.${encodeURIComponent(email)}`,
      {
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    const data = await response.json();
    return Array.isArray(data) && data.length > 0;
  }

  // Database operations
  async getRecipes() {
    const response = await fetch(
      `${this.url}/rest/v1/recipes?order=created_at.desc`,
      { headers: this.headers }
    );
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async getPendingRecipes() {
    const response = await fetch(
      `${this.url}/rest/v1/pending_recipes?order=created_at.desc`,
      { headers: this.headers }
    );
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async submitRecipe(recipe) {
    const response = await fetch(
      `${this.url}/rest/v1/pending_recipes`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(recipe)
      }
    );
    return await response.json();
  }

  async approveRecipe(recipe, accessToken) {
    // First, insert into recipes table
    const approvedRecipe = {
      title: recipe.title,
      author: recipe.author,
      story: recipe.story,
      prep_time: recipe.prep_time,
      cook_time: recipe.cook_time,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      tags: recipe.tags,
      photo: recipe.photo,
      photo_credit: recipe.photo_credit,
      status: 'approved'
    };

    const insertResponse = await fetch(
      `${this.url}/rest/v1/recipes`,
      {
        method: 'POST',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(approvedRecipe)
      }
    );

    if (insertResponse.ok) {
      // Then delete from pending
      await fetch(
        `${this.url}/rest/v1/pending_recipes?id=eq.${recipe.id}`,
        {
          method: 'DELETE',
          headers: {
            ...this.headers,
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
    }

    return insertResponse.ok;
  }

  async rejectRecipe(recipeId, accessToken) {
    const response = await fetch(
      `${this.url}/rest/v1/pending_recipes?id=eq.${recipeId}`,
      {
        method: 'DELETE',
        headers: {
          ...this.headers,
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    return response.ok;
  }
}

const supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BoilBakeFry = () => {
  const [recipes, setRecipes] = useState([]);
  const [pendingRecipes, setPendingRecipes] = useState([]);
  const [view, setView] = useState('home');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  // Supabase Auth State
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  
  // Stock Photo State
  const [suggestedPhotos, setSuggestedPhotos] = useState([]);
  const [showStockPhotos, setShowStockPhotos] = useState(false);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    title: '',
    story: '',
    prepTime: '',
    cookTime: '',
    servings: '',
    ingredients: '',
    instructions: '',
    tags: '',
    author: '',
    photo: null,
    photoCredit: '',
    email: ''
  });

  // Load recipes from Supabase on mount
  useEffect(() => {
    const loadRecipes = async () => {
      try {
        const recipesData = await supabase.getRecipes();
        setRecipes(recipesData);
      } catch (error) {
        console.log('Error loading recipes:', error);
      }
    };
    loadRecipes();

    // Check for existing session
    const checkSession = async () => {
      const savedSession = localStorage.getItem('supabase_session');
      if (savedSession) {
        try {
          const session = JSON.parse(savedSession);
          const userData = await supabase.getUser(session.access_token);
          if (userData.email) {
            setUser(userData);
            setAccessToken(session.access_token);
            const adminStatus = await supabase.isAdmin(userData.email, session.access_token);
            setIsAdmin(adminStatus);
            if (adminStatus) {
              const pendingData = await supabase.getPendingRecipes();
              setPendingRecipes(pendingData);
            }
          } else {
            localStorage.removeItem('supabase_session');
          }
        } catch (error) {
          console.error('Session check failed:', error);
          localStorage.removeItem('supabase_session');
        }
      }
    };
    checkSession();
  }, []);

  // Auto-suggest photos when title changes
  useEffect(() => {
    if (formData.title && formData.title.length > 3 && showSubmitForm) {
      const timer = setTimeout(() => {
        fetchStockPhotos(formData.title);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [formData.title, showSubmitForm]);

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({...formData, photo: reader.result, photoCredit: ''});
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAdminToggle = () => {
    if (isAdmin) {
      setShowAdminPanel(!showAdminPanel);
    } else {
      setShowLoginForm(true);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');

    try {
      const response = await supabase.signIn(loginEmail, loginPassword);
      
      if (response.error) {
        setLoginError(response.error.message || 'Invalid email or password');
        setIsLoading(false);
        return;
      }

      if (response.access_token) {
        localStorage.setItem('supabase_session', JSON.stringify(response));
        setAccessToken(response.access_token);
        
        const userData = await supabase.getUser(response.access_token);
        setUser(userData);

        const adminStatus = await supabase.isAdmin(userData.email, response.access_token);
        
        if (adminStatus) {
          setIsAdmin(true);
          setShowAdminPanel(true);
          setShowLoginForm(false);
          setLoginEmail('');
          setLoginPassword('');
          
          // Load pending recipes
          const pendingData = await supabase.getPendingRecipes();
          setPendingRecipes(pendingData);
        } else {
          setLoginError('You do not have admin privileges');
          localStorage.removeItem('supabase_session');
        }
      }
    } catch (error) {
      setLoginError('Login failed. Please try again.');
      console.error('Login error:', error);
    }
    
    setIsLoading(false);
  };

  const handleLogout = async () => {
    try {
      if (accessToken) {
        await supabase.signOut(accessToken);
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    localStorage.removeItem('supabase_session');
    setUser(null);
    setIsAdmin(false);
    setAccessToken(null);
    setShowAdminPanel(false);
  };

  const approveRecipe = async (recipe) => {
    if (!accessToken) return;
    
    const success = await supabase.approveRecipe(recipe, accessToken);
    
    if (success) {
      // Refresh both lists
      const updatedPending = await supabase.getPendingRecipes();
      setPendingRecipes(updatedPending);
      
      const updatedRecipes = await supabase.getRecipes();
      setRecipes(updatedRecipes);
    }
  };

  const rejectRecipe = async (recipeId) => {
    if (!accessToken) return;
    
    const success = await supabase.rejectRecipe(recipeId, accessToken);
    
    if (success) {
      const updatedPending = await supabase.getPendingRecipes();
      setPendingRecipes(updatedPending);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newRecipe = {
      title: formData.title,
      author: formData.author,
      email: formData.email,
      story: formData.story,
      prep_time: parseInt(formData.prepTime) || 0,
      cook_time: parseInt(formData.cookTime) || 0,
      servings: formData.servings,
      ingredients: formData.ingredients.split('\n').filter(i => i.trim()),
      instructions: formData.instructions.split('\n').filter(i => i.trim()),
      tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
      photo: formData.photo,
      photo_credit: formData.photoCredit,
      status: 'pending'
    };
    
    try {
      await supabase.submitRecipe(newRecipe);
      
      setFormData({
        title: '', story: '', prepTime: '', cookTime: '', servings: '',
        ingredients: '', instructions: '', tags: '', author: '', photo: null, photoCredit: '', email: ''
      });
      setSuggestedPhotos([]);
      setShowSubmitForm(false);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 5000);
    } catch (error) {
      console.error('Error submitting recipe:', error);
      alert('There was an error submitting your recipe. Please try again.');
    }
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    recipe.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
    recipe.story?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stock Photo Functions
  const fetchStockPhotos = async (query, isManualSearch = false) => {
    if (!query || query.trim().length < 2) return;
    
    setIsLoadingPhotos(true);
    
    try {
      const cleanQuery = encodeURIComponent(query.trim());
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${cleanQuery}+food&per_page=9&orientation=landscape`,
        {
          headers: {
            'Authorization': 'Client-ID MBAsgvyqzO1tNoEYRPi_tOYow5b2Ptai5A07RgDonbg'
          }
        }
      );
      
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        setSuggestedPhotos(data.results);
        if (isManualSearch) {
          setShowStockPhotos(true);
        }
      } else {
        const fallbackResponse = await fetch(
          `https://api.unsplash.com/search/photos?query=food+delicious&per_page=9&orientation=landscape`,
          {
            headers: {
              'Authorization': 'Client-ID MBAsgvyqzO1tNoEYRPi_tOYow5b2Ptai5A07RgDonbg'
            }
          }
        );
        const fallbackData = await fallbackResponse.json();
        setSuggestedPhotos(fallbackData.results || []);
      }
    } catch (error) {
      console.error('Error fetching stock photos:', error);
      setSuggestedPhotos([]);
    }
    
    setIsLoadingPhotos(false);
  };

  const selectStockPhoto = (photo) => {
    setFormData({
      ...formData,
      photo: photo.urls.regular,
      photoCredit: `Photo by ${photo.user.name} on Unsplash`
    });
    setShowStockPhotos(false);
  };

  const handleManualPhotoSearch = () => {
    if (manualSearchQuery.trim()) {
      fetchStockPhotos(manualSearchQuery, true);
    }
  };

  const getFieldHint = (fieldName) => {
    const hints = {
      title: "Make it specific! Include the main ingredient or cooking style. Examples: 'Grandma's Sunday Pot Roast' or 'Quick Weeknight Pad Thai'",
      story: "Share the origin, a memory, or what makes this recipe special. Paint a picture with sensory details - sounds, smells, textures.",
      ingredients: "Be specific with quantities and preparation. Example: '2 medium onions, finely diced' instead of 'onions'",
      instructions: "Include temperatures, times, and visual cues. Example: 'Bake at 350°F for 25-30 minutes until golden brown' instead of 'bake until done'",
      tags: "Help others find your recipe! Include cuisine type, meal type, dietary info, key ingredients."
    };
    return hints[fieldName] || '';
  };

  const RecipeCard = ({ recipe }) => (
    <div 
      onClick={() => {
        setSelectedRecipe(recipe);
        setView('detail');
      }}
      className="recipe-card"
    >
      {recipe.photo && (
        <div className="recipe-card-image">
          <img src={recipe.photo} alt={recipe.title} />
        </div>
      )}
      <div className="recipe-card-content">
        <h3>{recipe.title}</h3>
        <p className="story-preview">{recipe.story?.substring(0, 120)}...</p>
        <div className="recipe-meta">
          <span><Clock size={14} /> {(recipe.prep_time || 0) + (recipe.cook_time || 0)} min</span>
          <span><Users size={14} /> {recipe.servings}</span>
        </div>
        <div className="tags">
          {recipe.tags?.map((tag, i) => (
            <span key={i} className="tag">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;600&family=Karla:wght@400;500;600&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Karla', sans-serif;
          background: #fafaf8;
          color: #1a1a1a;
        }

        .app {
          min-height: 100vh;
        }

        /* Header */
        .header {
          background: white;
          border-bottom: 1px solid #e8e6e1;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 80px;
        }

        .logo {
          font-family: 'Crimson Pro', serif;
          font-size: 28px;
          font-weight: 600;
          color: #8b3a3a;
          cursor: pointer;
          letter-spacing: -0.5px;
        }

        .nav {
          display: flex;
          gap: 32px;
          align-items: center;
        }

        .nav button {
          background: none;
          border: none;
          font-family: 'Karla', sans-serif;
          font-size: 15px;
          color: #1a1a1a;
          cursor: pointer;
          padding: 8px 0;
          position: relative;
          transition: color 0.2s;
        }

        .nav button:hover {
          color: #8b3a3a;
        }

        .nav button.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #8b3a3a;
        }

        .submit-btn {
          background: #8b3a3a !important;
          color: white !important;
          padding: 10px 20px !important;
          border-radius: 4px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .submit-btn:hover {
          background: #6f2e2e !important;
        }

        /* Hero Section */
        .hero {
          background: linear-gradient(135deg, #f8f5f0 0%, #ffffff 100%);
          padding: 80px 24px;
          text-align: center;
          border-bottom: 1px solid #e8e6e1;
        }

        .hero h1 {
          font-family: 'Crimson Pro', serif;
          font-size: 56px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 16px;
          letter-spacing: -1px;
        }

        .hero p {
          font-size: 18px;
          color: #666;
          max-width: 600px;
          margin: 0 auto 40px;
          line-height: 1.6;
        }

        .search-bar {
          max-width: 500px;
          margin: 0 auto;
          position: relative;
        }

        .search-bar input {
          width: 100%;
          padding: 16px 48px 16px 20px;
          border: 2px solid #e8e6e1;
          border-radius: 8px;
          font-size: 16px;
          font-family: 'Karla', sans-serif;
          transition: border-color 0.2s;
        }

        .search-bar input:focus {
          outline: none;
          border-color: #8b3a3a;
        }

        .search-icon {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #999;
        }

        /* Recipe Grid */
        .recipes-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 60px 24px;
        }

        .recipes-header {
          margin-bottom: 40px;
        }

        .recipes-header h2 {
          font-family: 'Crimson Pro', serif;
          font-size: 36px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .recipes-count {
          color: #666;
          font-size: 15px;
        }

        .recipes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 32px;
        }

        .recipe-card {
          background: white;
          border: 1px solid #e8e6e1;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .recipe-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
        }

        .recipe-card-image {
          width: 100%;
          height: 240px;
          overflow: hidden;
          background: #f4f2ed;
        }

        .recipe-card-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s;
        }

        .recipe-card:hover .recipe-card-image img {
          transform: scale(1.05);
        }

        .recipe-card-content {
          padding: 24px;
        }

        .recipe-card h3 {
          font-family: 'Crimson Pro', serif;
          font-size: 24px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 12px;
          line-height: 1.3;
        }

        .story-preview {
          color: #666;
          font-size: 15px;
          line-height: 1.6;
          margin-bottom: 16px;
        }

        .recipe-meta {
          display: flex;
          gap: 20px;
          margin-bottom: 12px;
          font-size: 14px;
          color: #999;
        }

        .recipe-meta span {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tag {
          background: #f4f2ed;
          color: #666;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 13px;
        }

        /* Recipe Detail */
        .recipe-detail {
          max-width: 800px;
          margin: 0 auto;
          padding: 60px 24px;
        }

        .recipe-detail-image {
          width: 100%;
          height: 400px;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 32px;
        }

        .recipe-detail-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .back-btn {
          background: none;
          border: none;
          color: #8b3a3a;
          font-size: 15px;
          cursor: pointer;
          margin-bottom: 32px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .recipe-detail h1 {
          font-family: 'Crimson Pro', serif;
          font-size: 48px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 16px;
          line-height: 1.2;
        }

        .recipe-detail .author {
          color: #999;
          font-size: 15px;
          margin-bottom: 32px;
        }

        .recipe-detail .story {
          font-size: 18px;
          line-height: 1.8;
          color: #333;
          margin-bottom: 40px;
          font-style: italic;
          border-left: 3px solid #8b3a3a;
          padding-left: 24px;
        }

        .recipe-info {
          display: flex;
          gap: 32px;
          padding: 24px 0;
          border-top: 1px solid #e8e6e1;
          border-bottom: 1px solid #e8e6e1;
          margin-bottom: 40px;
        }

        .info-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #666;
        }

        .recipe-section {
          margin-bottom: 40px;
        }

        .recipe-section h2 {
          font-family: 'Crimson Pro', serif;
          font-size: 28px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 20px;
        }

        .recipe-section ul {
          list-style: none;
        }

        .recipe-section li {
          padding: 12px 0;
          border-bottom: 1px solid #f4f2ed;
          line-height: 1.6;
        }

        .recipe-section ol {
          counter-reset: step;
          list-style: none;
        }

        .recipe-section ol li {
          counter-increment: step;
          padding: 20px 0 20px 48px;
          position: relative;
          border-bottom: 1px solid #f4f2ed;
        }

        .recipe-section ol li::before {
          content: counter(step);
          position: absolute;
          left: 0;
          top: 20px;
          width: 32px;
          height: 32px;
          background: #8b3a3a;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
        }

        /* Submit Form */
        .form-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }

        .form-container {
          background: white;
          border-radius: 12px;
          max-width: 700px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
        }

        .form-header {
          padding: 32px 32px 24px;
          border-bottom: 1px solid #e8e6e1;
          position: sticky;
          top: 0;
          background: white;
          z-index: 1;
        }

        .form-header h2 {
          font-family: 'Crimson Pro', serif;
          font-size: 32px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .close-btn {
          position: absolute;
          top: 32px;
          right: 32px;
          background: none;
          border: none;
          cursor: pointer;
          color: #999;
          transition: color 0.2s;
        }

        .close-btn:hover {
          color: #1a1a1a;
        }

        .guidelines {
          background: #f8f5f0;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 24px;
          font-size: 14px;
          line-height: 1.6;
        }

        .guidelines h3 {
          font-family: 'Crimson Pro', serif;
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 12px;
        }

        .guidelines ul {
          margin-left: 20px;
          color: #666;
        }

        .guidelines li {
          margin-bottom: 8px;
        }

        .form-content {
          padding: 32px;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-group label {
          display: block;
          font-weight: 500;
          color: #1a1a1a;
          margin-bottom: 8px;
          font-size: 15px;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #e8e6e1;
          border-radius: 6px;
          font-family: 'Karla', sans-serif;
          font-size: 15px;
          transition: border-color 0.2s;
        }

        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #8b3a3a;
        }

        .form-group textarea {
          resize: vertical;
          min-height: 100px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
        }

        .helper-text {
          font-size: 13px;
          color: #999;
          margin-top: 4px;
        }

        .helper-text-hint {
          font-size: 13px;
          color: #666;
          margin-top: 8px;
          padding: 8px 12px;
          background: #f8f5f0;
          border-radius: 4px;
          border-left: 3px solid #8b3a3a;
          line-height: 1.5;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          padding: 24px 32px;
          border-top: 1px solid #e8e6e1;
          position: sticky;
          bottom: 0;
          background: white;
        }

        .form-actions button {
          flex: 1;
          padding: 14px;
          border: none;
          border-radius: 6px;
          font-family: 'Karla', sans-serif;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: #8b3a3a;
          color: white;
        }

        .btn-primary:hover {
          background: #6f2e2e;
        }

        .btn-secondary {
          background: #f4f2ed;
          color: #666;
        }

        .btn-secondary:hover {
          background: #e8e6e1;
        }

        /* Photo Options */
        .photo-options {
          display: flex;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .btn-stock-photos,
        .btn-upload-photo {
          padding: 12px 20px;
          border: 2px solid #8b3a3a;
          background: white;
          color: #8b3a3a;
          border-radius: 6px;
          font-family: 'Karla', sans-serif;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-stock-photos:hover,
        .btn-upload-photo:hover {
          background: #8b3a3a;
          color: white;
        }

        .btn-upload-photo {
          display: inline-block;
        }

        .suggested-photos-section {
          margin: 24px 0;
          padding: 20px;
          background: #f8f5f0;
          border-radius: 8px;
        }

        .suggested-photos-title {
          font-family: 'Crimson Pro', serif;
          font-size: 18px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 16px;
        }

        .suggested-photos-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }

        .suggested-photo-item {
          position: relative;
          aspect-ratio: 4/3;
          border-radius: 6px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .suggested-photo-item:hover {
          transform: scale(1.05);
        }

        .suggested-photo-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .photo-overlay {
          position: absolute;
          inset: 0;
          background: rgba(139, 58, 58, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
          color: white;
          font-weight: 500;
        }

        .suggested-photo-item:hover .photo-overlay {
          opacity: 1;
        }

        .btn-show-more-photos {
          width: 100%;
          padding: 10px;
          background: white;
          border: 2px solid #8b3a3a;
          color: #8b3a3a;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-show-more-photos:hover {
          background: #8b3a3a;
          color: white;
        }

        .photo-preview {
          margin-top: 16px;
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid #e8e6e1;
        }

        .photo-preview img {
          width: 100%;
          height: 240px;
          object-fit: cover;
          display: block;
        }

        .photo-credit {
          font-size: 12px;
          color: #666;
          padding: 8px 12px;
          background: #f8f5f0;
          font-style: italic;
        }

        .remove-photo {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(0,0,0,0.7);
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.2s;
        }

        .remove-photo:hover {
          background: rgba(0,0,0,0.9);
        }

        /* Stock Photos Modal */
        .stock-photos-modal {
          background: white;
          border-radius: 12px;
          max-width: 900px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .stock-photos-content {
          padding: 0;
        }

        .stock-photos-search {
          padding: 24px;
          border-bottom: 1px solid #e8e6e1;
          display: flex;
          gap: 12px;
        }

        .stock-photos-search input {
          flex: 1;
          padding: 12px;
          border: 2px solid #e8e6e1;
          border-radius: 6px;
          font-family: 'Karla', sans-serif;
          font-size: 15px;
        }

        .stock-photos-search input:focus {
          outline: none;
          border-color: #8b3a3a;
        }

        .stock-photos-search button {
          padding: 12px 24px;
          background: #8b3a3a;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .stock-photos-search button:hover:not(:disabled) {
          background: #6f2e2e;
        }

        .stock-photos-search button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading-photos,
        .no-photos {
          padding: 60px 24px;
          text-align: center;
          color: #666;
        }

        .stock-photos-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          padding: 24px;
        }

        .stock-photo-item {
          position: relative;
          aspect-ratio: 4/3;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .stock-photo-item:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }

        .stock-photo-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .stock-photo-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 16px;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .stock-photo-item:hover .stock-photo-overlay {
          opacity: 1;
        }

        .photo-info {
          margin-bottom: 8px;
        }

        .photo-photographer {
          color: white;
          font-size: 12px;
        }

        .btn-select-photo {
          background: white;
          color: #8b3a3a;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-select-photo:hover {
          background: #8b3a3a;
          color: white;
        }

        .stock-photos-footer {
          padding: 16px 24px;
          border-top: 1px solid #e8e6e1;
          background: #f8f5f0;
        }

        /* Success Message */
        .success-message {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: #2d5a3d;
          color: white;
          padding: 16px 32px;
          border-radius: 8px;
          font-weight: 500;
          z-index: 300;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        /* Admin Panel */
        .admin-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 600px;
          max-width: 100%;
          background: white;
          box-shadow: -4px 0 24px rgba(0,0,0,0.1);
          z-index: 150;
          overflow-y: auto;
        }

        .admin-header {
          padding: 32px;
          border-bottom: 1px solid #e8e6e1;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: sticky;
          top: 0;
          background: white;
          z-index: 1;
        }

        .admin-header h2 {
          font-family: 'Crimson Pro', serif;
          font-size: 28px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          padding: 24px 32px;
        }

        .stat-card {
          background: #f8f5f0;
          padding: 20px;
          border-radius: 8px;
          text-align: center;
        }

        .stat-card h4 {
          font-size: 12px;
          text-transform: uppercase;
          color: #666;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-family: 'Crimson Pro', serif;
          font-size: 32px;
          font-weight: 600;
          color: #8b3a3a;
        }

        .pending-list {
          padding: 24px 32px;
        }

        .pending-recipe {
          display: grid;
          grid-template-columns: 120px 1fr auto;
          gap: 20px;
          padding: 20px;
          background: #f8f5f0;
          border-radius: 8px;
          margin-bottom: 16px;
          align-items: start;
        }

        .pending-recipe img {
          width: 120px;
          height: 120px;
          object-fit: cover;
          border-radius: 6px;
        }

        .pending-recipe-content h3 {
          font-family: 'Crimson Pro', serif;
          font-size: 20px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 8px;
        }

        .pending-recipe-meta {
          font-size: 13px;
          color: #666;
          margin-bottom: 8px;
        }

        .pending-recipe-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .btn-approve {
          background: #2d5a3d;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-approve:hover {
          background: #234a31;
        }

        .btn-reject {
          background: #d45d5d;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-reject:hover {
          background: #c04545;
        }

        .admin-toggle {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background: #8b3a3a;
          color: white;
          border: none;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          font-size: 20px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          transition: all 0.2s;
          z-index: 100;
        }

        .admin-toggle:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(0,0,0,0.2);
        }

        .password-prompt {
          background: white;
          border-radius: 12px;
          max-width: 400px;
          width: 100%;
        }

        .empty-state {
          text-align: center;
          padding: 80px 24px;
        }

        .empty-state h3 {
          font-family: 'Crimson Pro', serif;
          font-size: 28px;
          color: #1a1a1a;
          margin-bottom: 12px;
        }

        .empty-state p {
          color: #666;
          margin-bottom: 24px;
        }

        @media (max-width: 768px) {
          .hero h1 {
            font-size: 40px;
          }
          
          .recipes-grid {
            grid-template-columns: 1fr;
          }
          
          .form-row {
            grid-template-columns: 1fr;
          }

          .suggested-photos-grid,
          .stock-photos-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .photo-options {
            flex-direction: column;
            align-items: stretch;
          }

          .photo-options span {
            display: none;
          }

          .pending-recipe {
            grid-template-columns: 1fr;
          }

          .pending-recipe img {
            width: 100%;
            height: 200px;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .admin-panel {
            width: 100%;
          }
        }
      `}</style>

      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo" onClick={() => setView('home')}>
            BoilBakeFry
          </div>
          <nav className="nav">
            <button 
              className={view === 'home' ? 'active' : ''}
              onClick={() => setView('home')}
            >
              Home
            </button>
            <button 
              className={view === 'browse' ? 'active' : ''}
              onClick={() => setView('browse')}
            >
              Browse Recipes
            </button>
            <button className="submit-btn" onClick={() => setShowSubmitForm(true)}>
              <Plus size={18} />
              Submit Recipe
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      {view === 'home' && (
        <>
          <section className="hero">
            <h1>Cook. Share. Savor.</h1>
            <p>A community of home cooks sharing recipes with soul, story, and substance.</p>
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search recipes, ingredients, or tags..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value) setView('browse');
                }}
              />
              <Search className="search-icon" size={20} />
            </div>
          </section>

          <div className="recipes-container">
            <div className="recipes-header">
              <h2>Featured Recipes</h2>
              <p className="recipes-count">{recipes.length} recipes and counting</p>
            </div>
            {recipes.length === 0 ? (
              <div className="empty-state">
                <ChefHat size={64} color="#8b3a3a" style={{margin: '0 auto 24px', display: 'block'}} />
                <h3>No recipes yet</h3>
                <p>Be the first to share a recipe with the community!</p>
                <button className="submit-btn" onClick={() => setShowSubmitForm(true)}>
                  <Plus size={18} />
                  Submit Your First Recipe
                </button>
              </div>
            ) : (
              <div className="recipes-grid">
                {recipes.slice(0, 6).map(recipe => (
                  <RecipeCard key={recipe.id} recipe={recipe} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'browse' && (
        <div className="recipes-container">
          <div className="recipes-header">
            <h2>{searchQuery ? `Results for "${searchQuery}"` : 'All Recipes'}</h2>
            <p className="recipes-count">
              {filteredRecipes.length} {filteredRecipes.length === 1 ? 'recipe' : 'recipes'}
            </p>
          </div>
          <div className="search-bar" style={{marginBottom: '40px'}}>
            <input
              type="text"
              placeholder="Search recipes, ingredients, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search className="search-icon" size={20} />
          </div>
          {filteredRecipes.length === 0 ? (
            <div className="empty-state">
              <h3>No recipes found</h3>
              <p>Try adjusting your search or browse all recipes.</p>
            </div>
          ) : (
            <div className="recipes-grid">
              {filteredRecipes.map(recipe => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'detail' && selectedRecipe && (
        <div className="recipe-detail">
          <button className="back-btn" onClick={() => setView('browse')}>
            ← Back to recipes
          </button>
          {selectedRecipe.photo && (
            <div className="recipe-detail-image">
              <img src={selectedRecipe.photo} alt={selectedRecipe.title} />
            </div>
          )}
          <h1>{selectedRecipe.title}</h1>
          <p className="author">By {selectedRecipe.author}</p>
          
          <div className="story">{selectedRecipe.story}</div>

          <div className="recipe-info">
            <div className="info-item">
              <Clock size={18} />
              <span>Prep: {selectedRecipe.prep_time} min</span>
            </div>
            <div className="info-item">
              <Clock size={18} />
              <span>Cook: {selectedRecipe.cook_time} min</span>
            </div>
            <div className="info-item">
              <Users size={18} />
              <span>Serves {selectedRecipe.servings}</span>
            </div>
          </div>

          <div className="recipe-section">
            <h2>Ingredients</h2>
            <ul>
              {selectedRecipe.ingredients?.map((ingredient, i) => (
                <li key={i}>{ingredient}</li>
              ))}
            </ul>
          </div>

          <div className="recipe-section">
            <h2>Instructions</h2>
            <ol>
              {selectedRecipe.instructions?.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          {selectedRecipe.tags?.length > 0 && (
            <div className="tags">
              {selectedRecipe.tags.map((tag, i) => (
                <span key={i} className="tag">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit Form Modal */}
      {showSubmitForm && (
        <div className="form-overlay" onClick={(e) => {
          if (e.target.className === 'form-overlay') setShowSubmitForm(false);
        }}>
          <div className="form-container">
            <div className="form-header">
              <h2>Submit Your Recipe</h2>
              <button className="close-btn" onClick={() => setShowSubmitForm(false)}>
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div className="form-content">
                <div className="guidelines">
                  <h3>Guidelines for a Great Recipe</h3>
                  <ul>
                    <li><strong>Tell a story:</strong> Share the origin, memories, or inspiration behind the dish</li>
                    <li><strong>Be specific:</strong> Include measurements, temperatures, and timing details</li>
                    <li><strong>Write clearly:</strong> Use active voice and step-by-step instructions</li>
                    <li><strong>Add context:</strong> Explain techniques and offer substitutions where helpful</li>
                    <li><strong>Moderation:</strong> Your recipe will be reviewed and typically published within 24 hours</li>
                  </ul>
                </div>

                <div className="form-group">
                  <label>Recipe Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g., Grandma's Sunday Pot Roast"
                  />
                  <p className="helper-text-hint">💡 {getFieldHint('title')}</p>
                </div>

                <div className="form-group">
                  <label>Your Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.author}
                    onChange={(e) => setFormData({...formData, author: e.target.value})}
                    placeholder="How should we credit you?"
                  />
                </div>

                <div className="form-group">
                  <label>Your Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="your.email@example.com"
                  />
                  <p className="helper-text">We'll only use this to notify you when your recipe is approved. Not displayed publicly.</p>
                </div>

                <div className="form-group">
                  <label>Recipe Photo</label>
                  
                  <div className="photo-options">
                    <button 
                      type="button"
                      className="btn-stock-photos"
                      onClick={() => {
                        setShowStockPhotos(true);
                        if (suggestedPhotos.length === 0 && formData.title) {
                          fetchStockPhotos(formData.title, true);
                        }
                      }}
                    >
                      🖼️ Browse Stock Photos
                    </button>
                    <span style={{margin: '0 12px', color: '#999'}}>or</span>
                    <label className="btn-upload-photo">
                      📤 Upload Your Own
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        style={{display: 'none'}}
                      />
                    </label>
                  </div>

                  {suggestedPhotos.length > 0 && !formData.photo && (
                    <div className="suggested-photos-section">
                      <h4 className="suggested-photos-title">
                        💡 Suggested for "{formData.title}"
                      </h4>
                      <div className="suggested-photos-grid">
                        {suggestedPhotos.slice(0, 6).map((photo) => (
                          <div 
                            key={photo.id}
                            className="suggested-photo-item"
                            onClick={() => selectStockPhoto(photo)}
                          >
                            <img src={photo.urls.small} alt={photo.alt_description || 'Food photo'} />
                            <div className="photo-overlay">
                              <span>Select</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {suggestedPhotos.length > 6 && (
                        <button 
                          type="button"
                          className="btn-show-more-photos"
                          onClick={() => setShowStockPhotos(true)}
                        >
                          Show All {suggestedPhotos.length} Suggestions
                        </button>
                      )}
                    </div>
                  )}

                  {formData.photo && (
                    <div className="photo-preview">
                      <img src={formData.photo} alt="Recipe preview" />
                      {formData.photoCredit && (
                        <p className="photo-credit">{formData.photoCredit}</p>
                      )}
                      <button 
                        type="button"
                        className="remove-photo"
                        onClick={() => setFormData({...formData, photo: null, photoCredit: ''})}
                      >
                        <X size={16} /> Remove
                      </button>
                    </div>
                  )}
                  <p className="helper-text">
                    {isLoadingPhotos ? '🔄 Finding great photos for you...' : 'We\'ll suggest professional photos based on your recipe'}
                  </p>
                </div>

                <div className="form-group">
                  <label>Recipe Story *</label>
                  <textarea
                    required
                    value={formData.story}
                    onChange={(e) => setFormData({...formData, story: e.target.value})}
                    placeholder="Tell us about this recipe. Where does it come from? What makes it special? What memories does it evoke?"
                    rows="5"
                  />
                  <p className="helper-text-hint">💡 {getFieldHint('story')}</p>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Prep Time (min) *</label>
                    <input
                      type="number"
                      required
                      value={formData.prepTime}
                      onChange={(e) => setFormData({...formData, prepTime: e.target.value})}
                      placeholder="20"
                    />
                  </div>
                  <div className="form-group">
                    <label>Cook Time (min) *</label>
                    <input
                      type="number"
                      required
                      value={formData.cookTime}
                      onChange={(e) => setFormData({...formData, cookTime: e.target.value})}
                      placeholder="45"
                    />
                  </div>
                  <div className="form-group">
                    <label>Servings *</label>
                    <input
                      type="text"
                      required
                      value={formData.servings}
                      onChange={(e) => setFormData({...formData, servings: e.target.value})}
                      placeholder="4-6"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Ingredients *</label>
                  <textarea
                    required
                    value={formData.ingredients}
                    onChange={(e) => setFormData({...formData, ingredients: e.target.value})}
                    placeholder="2 cups all-purpose flour&#10;1 teaspoon salt&#10;3 large eggs, room temperature&#10;..."
                    rows="8"
                  />
                  <p className="helper-text-hint">💡 {getFieldHint('ingredients')}</p>
                </div>

                <div className="form-group">
                  <label>Instructions *</label>
                  <textarea
                    required
                    value={formData.instructions}
                    onChange={(e) => setFormData({...formData, instructions: e.target.value})}
                    placeholder="Preheat oven to 350°F and grease a 9x13 baking dish.&#10;In a large bowl, whisk together flour and salt.&#10;..."
                    rows="10"
                  />
                  <p className="helper-text-hint">💡 {getFieldHint('instructions')}</p>
                </div>

                <div className="form-group">
                  <label>Tags</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({...formData, tags: e.target.value})}
                    placeholder="comfort food, italian, weeknight dinner"
                  />
                  <p className="helper-text-hint">💡 {getFieldHint('tags')}</p>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowSubmitForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Submit Recipe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Message */}
      {showSuccessMessage && (
        <div className="success-message">
          ✅ Thank you! Your recipe will be reviewed and published within 24 hours.
        </div>
      )}

      {/* Admin Panel */}
      {showAdminPanel && isAdmin && (
        <div className="admin-panel">
          <div className="admin-header">
            <div>
              <h2>Admin Dashboard</h2>
              <p style={{fontSize: '14px', color: '#666', marginTop: '4px'}}>
                Logged in as {user?.email}
              </p>
            </div>
            <div style={{display: 'flex', gap: '12px'}}>
              <button className="btn-secondary" onClick={handleLogout}>
                <LogOut size={16} style={{marginRight: '6px'}} />
                Logout
              </button>
              <button className="btn-secondary" onClick={() => setShowAdminPanel(false)}>
                Close
              </button>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <h4>Total Recipes</h4>
              <div className="stat-value">{recipes.length}</div>
            </div>
            <div className="stat-card">
              <h4>Pending Review</h4>
              <div className="stat-value">{pendingRecipes.length}</div>
            </div>
            <div className="stat-card">
              <h4>Approved</h4>
              <div className="stat-value">{recipes.length}</div>
            </div>
          </div>

          <h3 style={{fontFamily: 'Crimson Pro, serif', fontSize: '24px', padding: '0 32px', marginBottom: '16px'}}>
            Pending Recipes ({pendingRecipes.length})
          </h3>

          {pendingRecipes.length === 0 ? (
            <div className="empty-state">
              <p>No pending recipes to review</p>
            </div>
          ) : (
            <div className="pending-list">
              {pendingRecipes.map(recipe => (
                <div key={recipe.id} className="pending-recipe">
                  {recipe.photo ? (
                    <img src={recipe.photo} alt={recipe.title} />
                  ) : (
                    <div style={{width: '120px', height: '120px', background: '#f4f2ed', borderRadius: '6px'}} />
                  )}
                  <div className="pending-recipe-content">
                    <h3>{recipe.title}</h3>
                    <div className="pending-recipe-meta">
                      By {recipe.author} • {recipe.email} • Submitted {new Date(recipe.created_at).toLocaleDateString()}
                    </div>
                    <p style={{marginBottom: '12px', lineHeight: '1.6'}}>{recipe.story?.substring(0, 200)}...</p>
                    <div style={{fontSize: '14px', color: '#666'}}>
                      <div>Time: {recipe.prep_time}min prep + {recipe.cook_time}min cook • Serves {recipe.servings}</div>
                      <div>Tags: {recipe.tags?.join(', ') || 'None'}</div>
                    </div>
                  </div>
                  <div className="pending-recipe-actions">
                    <button className="btn-approve" onClick={() => approveRecipe(recipe)}>
                      Approve
                    </button>
                    <button className="btn-reject" onClick={() => rejectRecipe(recipe.id)}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Toggle Button */}
      <button 
        className="admin-toggle" 
        onClick={handleAdminToggle}
        title={isAdmin ? "Admin Panel" : "Admin Login"}
      >
        ⚙️
      </button>

      {/* Login Form Modal */}
      {showLoginForm && (
        <div className="form-overlay" onClick={(e) => {
          if (e.target.className === 'form-overlay') {
            setShowLoginForm(false);
            setLoginEmail('');
            setLoginPassword('');
            setLoginError('');
          }
        }}>
          <div className="password-prompt">
            <div className="form-header">
              <h2>Admin Login</h2>
              <button className="close-btn" onClick={() => {
                setShowLoginForm(false);
                setLoginEmail('');
                setLoginPassword('');
                setLoginError('');
              }}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleLogin} style={{padding: '32px'}}>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@boilbakefry.com"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{borderColor: loginError ? '#d45d3e' : '#e8e6e1'}}
                />
                {loginError && (
                  <p style={{color: '#d45d3e', fontSize: '14px', marginTop: '8px'}}>
                    {loginError}
                  </p>
                )}
              </div>
              <button 
                type="submit" 
                className="btn-primary" 
                style={{width: '100%'}}
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Stock Photos Browser Modal */}
      {showStockPhotos && (
        <div className="form-overlay" onClick={(e) => {
          if (e.target.className === 'form-overlay') {
            setShowStockPhotos(false);
          }
        }}>
          <div className="stock-photos-modal">
            <div className="form-header">
              <h2>🖼️ Browse Stock Photos</h2>
              <button className="close-btn" onClick={() => setShowStockPhotos(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="stock-photos-content">
              <div className="stock-photos-search">
                <input
                  type="text"
                  placeholder="Search for food photos..."
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleManualPhotoSearch()}
                />
                <button onClick={handleManualPhotoSearch} disabled={isLoadingPhotos}>
                  {isLoadingPhotos ? '🔄' : '🔍'} Search
                </button>
              </div>

              {isLoadingPhotos ? (
                <div className="loading-photos">
                  <p>🔄 Finding perfect photos...</p>
                </div>
              ) : suggestedPhotos.length === 0 ? (
                <div className="no-photos">
                  <p>No photos found. Try a different search term!</p>
                </div>
              ) : (
                <div className="stock-photos-grid">
                  {suggestedPhotos.map((photo) => (
                    <div 
                      key={photo.id}
                      className="stock-photo-item"
                      onClick={() => selectStockPhoto(photo)}
                    >
                      <img src={photo.urls.small} alt={photo.alt_description || 'Food photo'} />
                      <div className="stock-photo-overlay">
                        <div className="photo-info">
                          <span className="photo-photographer">📷 {photo.user.name}</span>
                        </div>
                        <button className="btn-select-photo">Select Photo</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="stock-photos-footer">
                <p style={{fontSize: '13px', color: '#666', textAlign: 'center'}}>
                  Photos provided by <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" style={{color: '#8b3a3a'}}>Unsplash</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoilBakeFry;
