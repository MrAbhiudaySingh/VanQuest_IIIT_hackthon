// app.js - Controller logic, parameter parsing, rendering, and dynamic additions

(function () {
  const config = window.PROPERTY_APP_CONFIG;
  let properties = [...config.properties];
  let currentCategory = "all";
  let currentSort = "market-rent";

  // Cache DOM nodes
  const agentTitle = document.getElementById("agent-title");
  const agentSubtitle = document.getElementById("agent-subtitle");
  const navContainer = document.getElementById("header-nav-items");
  const residenceCard = document.getElementById("current-residence");
  const marketHud = document.getElementById("market-hud");
  const bannerBackdrop = document.getElementById("banner-backdrop");
  const categoryPills = document.getElementById("category-pills");
  const sortSelect = document.getElementById("sort-select");
  const propertiesList = document.getElementById("properties-list");
  const addModal = document.getElementById("add-prop-modal");

  // RENDER HEADER
  function renderHeader() {
    agentTitle.innerHTML = `<span>${config.agent.name}</span> <span style="font-weight:400; opacity:0.6;">—</span> <span>${config.agent.title}</span>`;
    agentSubtitle.textContent = config.agent.subtitle;

    navContainer.innerHTML = "";
    config.agent.navTabs.forEach((tab) => {
      const btn = document.createElement("button");
      btn.className = `nav-btn ${tab.active ? "active" : ""}`;
      btn.dataset.id = tab.id;
      btn.innerHTML = `${getIconSvg(tab.icon)} <span>${tab.label}</span>`;
      btn.onclick = () => {
        document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (tab.id === "yours") {
          currentCategory = "yours";
          renderProperties();
        } else if (tab.id === "properties") {
          currentCategory = "all";
          renderProperties();
        }
      };
      navContainer.appendChild(btn);
    });

    // Add quick "+ Add Property" button to the header
    const addBtn = document.createElement("button");
    addBtn.className = "add-prop-quick-btn";
    addBtn.innerHTML = `+ Add Property`;
    addBtn.onclick = () => openAddModal();
    navContainer.appendChild(addBtn);
  }

  // RENDER BANNER & MARKET STATS
  function renderBanner() {
    bannerBackdrop.src = config.currentHome.image;

    residenceCard.innerHTML = `
      <div class="badge-location-header">
        ${getIconSvg("map-pin")} You live at
      </div>
      <h2>${config.currentHome.name}</h2>
      <div class="rent-line">${config.currentHome.rentText}</div>
      <div class="deposit-line">${config.currentHome.depositText}</div>
      <button class="view-details-pill-btn" onclick="alert('Viewing house details for: ${config.currentHome.name}')">
        ${config.currentHome.buttonText}
      </button>
    `;

    marketHud.innerHTML = `
      <div class="market-hud-header">
        ${getIconSvg("trending-up")} ${config.marketSummary.title}
      </div>
      <div class="market-hud-grid">
        <div class="growth-primary">
          <div class="lbl">Growth</div>
          <div class="val">${config.marketSummary.growth}</div>
          <div class="period">${config.marketSummary.growthPeriod}</div>
        </div>
        <div class="growth-sub-breakdown">
          ${config.marketSummary.stats
            .map(
              (stat) => `
            <div class="breakdown-row">
              <span class="lbl">${stat.label}</span>
              <span class="val">${stat.value}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      <div class="market-disclaimer">
        <span>ℹ️</span>
        <span>${config.marketSummary.disclaimer}</span>
      </div>
    `;
  }

  // RENDER CATEGORIES
  function renderFilters() {
    categoryPills.innerHTML = "";
    config.filterCategories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = `cat-pill ${cat.id === currentCategory ? "active" : ""}`;
      btn.dataset.id = cat.id;
      btn.innerHTML = `${getIconSvg(cat.icon)} <span>${cat.label}</span>`;
      btn.onclick = () => {
        currentCategory = cat.id;
        document.querySelectorAll(".cat-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderProperties();
      };
      categoryPills.appendChild(btn);
    });

    sortSelect.innerHTML = config.sortOptions
      .map((opt) => `<option value="${opt.id}">${opt.label}</option>`)
      .join("");
    sortSelect.value = currentSort;
    sortSelect.onchange = (e) => {
      currentSort = e.target.value;
      renderProperties();
    };
  }

  // RENDER PROPERTIES
  function renderProperties() {
    let filtered = [...properties];

    if (currentCategory === "yours") {
      filtered = filtered.filter((p) => p.actionType === "current-rented" || p.isFavorite);
    } else if (currentCategory !== "all") {
      filtered = filtered.filter((p) => p.category === currentCategory);
    }

    // Sort
    if (currentSort === "market-rent") {
      filtered.sort((a, b) => (b.rawRent || 0) - (a.rawRent || 0));
    } else if (currentSort === "price-asc") {
      filtered.sort((a, b) => parsePrice(a.askingPrice) - parsePrice(b.askingPrice));
    } else if (currentSort === "price-desc") {
      filtered.sort((a, b) => parsePrice(b.askingPrice) - parsePrice(a.askingPrice));
    }

    propertiesList.innerHTML = "";

    if (filtered.length === 0) {
      propertiesList.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px;">
          No properties found in this category.
        </div>`;
      return;
    }

    filtered.forEach((prop) => {
      const row = document.createElement("div");
      row.className = "property-row";
      row.id = `property-${prop.id}`;

      // Build Tags
      const tagsHtml = (prop.tags || [])
        .map((tag) => `<span class="tag-badge">${tag.label}</span>`)
        .join("");

      // Action button
      let actionHtml = "";
      if (prop.actionType === "current-rented") {
        actionHtml = `<div class="badge-you-rent">YOU RENT<br>THIS</div>`;
      } else {
        actionHtml = `
          <button class="btn-rent" onclick="window.PropertyApp.handleRent('${prop.id}')">Rent</button>
          <button class="btn-buy" onclick="window.PropertyApp.handleBuy('${prop.id}')">Buy...</button>
        `;
      }

      row.innerHTML = `
        <!-- Col 1: Name, Badge & Specs -->
        <div class="prop-main-info">
          <div class="prop-header-title">
            <span class="prop-name">${prop.name}</span>
            ${prop.statusBadge ? `<span class="badge-current-home-inline">${prop.statusBadge}</span>` : ""}
          </div>
          <div class="prop-subtitle">${prop.subType || ""}</div>
          <div class="prop-tags">${tagsHtml}</div>
          <div class="prop-specs">
            <span class="spec-item">${getIconSvg("bed")} ${prop.specs?.beds || "-"}</span>
            <span class="spec-item">${getIconSvg("bath")} ${prop.specs?.baths || "-"}</span>
            <span class="spec-item">${getIconSvg("maximize")} ${prop.specs?.area || "-"}</span>
          </div>
        </div>

        <!-- Col 3: Asking Price -->
        <div class="stat-col">
          <span class="stat-label">Asking Price</span>
          <span class="stat-primary-val">${prop.askingPrice}</span>
          ${prop.estComparison ? `<span class="stat-comparison">${prop.estComparison}</span>` : ""}
          ${prop.estValue ? `<span class="stat-est-val">${prop.estValue}</span>` : ""}
        </div>

        <!-- Col 4: Market Rent -->
        <div class="stat-col">
          <span class="stat-label">Market Rent</span>
          <span class="stat-primary-val">${prop.marketRent}</span>
        </div>

        <!-- Col 5: Owner Upkeep -->
        <div class="stat-col">
          <span class="stat-label">Owner Upkeep</span>
          <span class="stat-primary-val">${prop.ownerUpkeep || "-"}</span>
        </div>

        <!-- Col 6: Buttons -->
        <div class="prop-actions">
          ${actionHtml}
          <button class="btn-fav ${prop.isFavorite ? "active" : ""}" title="Favorite" onclick="window.PropertyApp.toggleFavorite('${prop.id}')">
            ${getIconSvg("heart")}
          </button>
        </div>
      `;

      propertiesList.appendChild(row);
    });
  }

  function parsePrice(str) {
    if (!str) return 0;
    return parseInt(str.replace(/[^0-9]/g, "")) || 0;
  }

  // Icons helper
  function getIconSvg(name) {
    switch (name) {
      case "home":
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
      case "heart":
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
      case "bar-chart-2":
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`;
      case "book-open":
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`;
      case "building":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M8 10h.01"></path><path d="M16 10h.01"></path><path d="M8 14h.01"></path><path d="M16 14h.01"></path></svg>`;
      case "circle":
        return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle></svg>`;
      case "award":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`;
      case "trending-up":
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
      case "map-pin":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
      case "bed":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"></svg>`;
      case "bath":
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6h6a3 3 0 0 1 3 3v2H6V9a3 3 0 0 1 3-3zM4 11h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1z"></path></svg>`;
      case "maximize":
        return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
      case "image-placeholder":
        return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
      default:
        return "";
    }
  }

  // MODAL / PARAMETER MANAGEMENT
  function openAddModal() {
    addModal.classList.add("open");
  }

  function closeAddModal() {
    addModal.classList.remove("open");
  }

  // Exposed Global API to programmatically or manually add / modify properties
  window.PropertyApp = {
    // Add property programmatically via code or console!
    addProperty: function (newProp) {
      if (!newProp.id) {
        newProp.id = "prop-" + Date.now();
      }
      properties.push(newProp);
      renderProperties();
      console.log("Added property:", newProp);
    },

    // Set properties collection
    setProperties: function (newPropsList) {
      properties = [...newPropsList];
      renderProperties();
    },

    // Get current list
    getProperties: function () {
      return properties;
    },

    toggleFavorite: function (id) {
      const p = properties.find((item) => item.id === id);
      if (p) {
        p.isFavorite = !p.isFavorite;
        renderProperties();
      }
    },

    handleRent: function (id) {
      const p = properties.find((item) => item.id === id);
      alert(`Rent request submitted for ${p.name} (${p.marketRent})!`);
    },

    handleBuy: function (id) {
      const p = properties.find((item) => item.id === id);
      alert(`Buy consultation opened for ${p.name} (Asking: ${p.askingPrice})!`);
    },

    openAddModal: openAddModal,
    closeAddModal: closeAddModal
  };

  // Form submission handler
  document.getElementById("add-prop-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const name = document.getElementById("form-name").value;
    const subType = document.getElementById("form-subtype").value;
    const category = document.getElementById("form-category").value;
    const askingPrice = document.getElementById("form-price").value;
    const marketRent = document.getElementById("form-rent").value;
    const upkeep = document.getElementById("form-upkeep").value;
    const beds = document.getElementById("form-beds").value;
    const baths = document.getElementById("form-baths").value;
    const area = document.getElementById("form-area").value;
    const tagsRaw = document.getElementById("form-tags").value;
    const imageUrl = document.getElementById("form-image").value;

    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => ({ label: t.trim(), type: "subtle-blue" }))
      : [{ label: "Standard", type: "subtle-blue" }];

    const rawRent = parseInt(marketRent.replace(/[^0-9]/g, "")) || 0;

    window.PropertyApp.addProperty({
      id: "prop-" + Date.now(),
      name: name,
      subType: subType || "Apartment · Standard",
      category: category,
      tags: tags,
      specs: {
        beds: beds ? `${beds} Beds` : "2 Beds",
        baths: baths ? `${baths} Baths` : "1 Bath",
        area: area ? `${area} sq ft` : "750 sq ft"
      },
      askingPrice: askingPrice.startsWith("₹") ? askingPrice : `₹${askingPrice}`,
      estComparison: "+2.0% vs est.",
      estValue: askingPrice,
      marketRent: marketRent.startsWith("₹") ? marketRent : `₹${marketRent}/mo`,
      rawRent: rawRent,
      ownerUpkeep: upkeep.startsWith("₹") ? upkeep : `₹${upkeep}/mo`,
      statusBadge: null,
      actionType: "rent-buy",
      isFavorite: false,
      image: imageUrl || "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=400&q=80"
    });

    closeAddModal();
    this.reset();
  });

  // INITIAL BOOTSTRAP
  function init() {
    renderHeader();
    renderBanner();
    renderFilters();
    renderProperties();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
