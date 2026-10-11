// properties-data.js
// Data model and default configuration for the Property Agent interface
// You can edit or dynamically add items to this data structure!

window.PROPERTY_APP_CONFIG = {
  agent: {
    name: "Lakshmi Rao",
    title: "Property Agent",
    subtitle: "Renting or buying — let's look at what you can actually afford.",
    navTabs: [
      { id: "properties", label: "Properties", icon: "home", active: true },
      { id: "yours", label: "Yours (0)", icon: "heart", count: 0 },
      { id: "performance", label: "Performance (0)", icon: "bar-chart-2", count: 0 },
      { id: "rules", label: "Rules", icon: "book-open" }
    ]
  },
  currentHome: {
    name: "Elm Court Flat 2B",
    rentText: "Renting at ₹3,000/month (paid on the 1st)",
    depositText: "Deposit held by the landlord ₹0.",
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80",
    buttonText: "View House Details →"
  },
  marketSummary: {
    title: "City-wide housing market",
    growth: "+1.0%",
    growthPeriod: "over the last 1 month",
    disclaimer: "Each neighbourhood moves differently. Nobody can tell you what happens next.",
    stats: [
      { label: "Budget residential", value: "+0.7%" },
      { label: "Well-connected central", value: "+1.5%" },
      { label: "Established family neighbourhood", value: "+0.7%" },
      { label: "Premium residential", value: "+2.2%" }
    ]
  },
  filterCategories: [
    { id: "all", label: "All Properties", icon: "building", defaultActive: true },
    { id: "budget", label: "Budget", icon: "circle" },
    { id: "well-connected", label: "Well-connected", icon: "heart" },
    { id: "family", label: "Family Friendly", icon: "home" },
    { id: "premium", label: "Premium", icon: "award" }
  ],
  sortOptions: [
    { id: "market-rent", label: "Market Rent" },
    { id: "price-asc", label: "Asking Price (Low to High)" },
    { id: "price-desc", label: "Asking Price (High to Low)" },
    { id: "area", label: "Area (Sq Ft)" }
  ],
  // List of properties: parameterised and easily extensible!
  properties: [
    {
      id: "elm-court-flat-2b",
      name: "Elm Court Flat 2B",
      subType: "Small apartment · Basic",
      category: "budget",
      tags: [
        { label: "Budget residential", type: "subtle-blue" },
        { label: "Good value", type: "subtle-blue" }
      ],
      specs: {
        beds: "1 Bed",
        baths: "1 Bath",
        area: "550 sq ft"
      },
      askingPrice: "₹6,42,000",
      estComparison: "+6.2% vs est.",
      estValue: "₹6,04,486",
      marketRent: "₹3,000/mo",
      rawRent: 3000,
      ownerUpkeep: "₹500/mo",
      statusBadge: "CURRENT HOME",
      actionType: "current-rented", // 'current-rented', 'rent-buy', etc.
      isFavorite: false,
      image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=400&q=80"
    },
    {
      id: "lakeview-residences-4a",
      name: "Lakeview Residences 4A",
      subType: "Better apartment · Good",
      category: "well-connected",
      tags: [
        { label: "Well-connected", type: "subtle-blue" },
        { label: "Central", type: "subtle-blue" }
      ],
      specs: {
        beds: "2 Beds",
        baths: "2 Baths",
        area: "820 sq ft"
      },
      askingPrice: "₹13,98,000",
      estComparison: "+5.9% vs est.",
      estValue: "₹13,19,850",
      marketRent: "₹6,100/mo",
      rawRent: 6100,
      ownerUpkeep: "₹900/mo",
      statusBadge: null,
      actionType: "rent-buy",
      isFavorite: false,
      image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=80"
    },
    {
      id: "starter-home-12-elm",
      name: "Starter Home · 12 Elm St",
      subType: "Starter house · Good",
      category: "family",
      tags: [
        { label: "Family neighbourhood", type: "subtle-blue" },
        { label: "Established", type: "subtle-blue" }
      ],
      specs: {
        beds: "3 Beds",
        baths: "2 Baths",
        area: "1,200 sq ft"
      },
      askingPrice: "₹19,81,000",
      estComparison: "+3.5% vs est.",
      estValue: "₹19,13,153",
      marketRent: "₹8,500/mo",
      rawRent: 8500,
      ownerUpkeep: "₹1,200/mo",
      statusBadge: null,
      actionType: "rent-buy",
      isFavorite: false,
      image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80"
    },
    {
      id: "family-home-18-elm",
      name: "Family Home · 18 Elm St",
      subType: "Family house · Very good",
      category: "family",
      tags: [
        { label: "Family neighbourhood", type: "subtle-blue" },
        { label: "Spacious", type: "subtle-blue" }
      ],
      specs: {
        beds: "4 Beds",
        baths: "3 Baths",
        area: "1,800 sq ft"
      },
      askingPrice: "₹33,04,000",
      estComparison: "+2.5% vs est.",
      estValue: "₹32,22,152",
      marketRent: "₹14,100/mo",
      rawRent: 14100,
      ownerUpkeep: "₹1,800/mo",
      statusBadge: null,
      actionType: "rent-buy",
      isFavorite: false,
      image: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=400&q=80"
    },
    {
      id: "large-house-24-elm",
      name: "Large House · 24 Elm St",
      subType: "Large house · Very good",
      category: "premium",
      tags: [
        { label: "Premium residential", type: "subtle-blue" },
        { label: "Luxury", type: "subtle-blue" }
      ],
      specs: {
        beds: "5 Beds",
        baths: "4 Baths",
        area: "2,500 sq ft"
      },
      askingPrice: "₹56,67,000",
      estComparison: "+0.8% vs est.",
      estValue: "₹56,22,929",
      marketRent: "₹23,300/mo",
      rawRent: 23300,
      ownerUpkeep: "₹3,000/mo",
      statusBadge: null,
      actionType: "rent-buy",
      isFavorite: false,
      image: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=400&q=80"
    }
  ]
};
