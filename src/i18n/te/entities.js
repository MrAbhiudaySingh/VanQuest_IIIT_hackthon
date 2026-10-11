// Names that appear inside sentences. Each is cut out before a sentence is looked up and put back
// translated, so one template serves every place / item / asset.
// Policy (README, Round 9): brand, place, asset and vehicle names stay in English — they match the signs
// drawn into the map art and are product names; people's names are written in Telugu script; items, jobs
// and fields of study are ordinary words and are translated.
const same = names => Object.fromEntries(names.map(n => [n, n]));

export const ENTITIES = {
  // places and businesses (English, as on the map signs)
  ...same(['Summit Financial Tower', 'Summit Practice Trading Desk', 'Compound Financial Academy', 'Nidhi Bank', 'Riverside High School', 'Riverside High', 'Ashford College',
    'FreshCart Grocery', 'FreshCart', 'Thread & Co. Clothing', 'Thread & Co.', 'Voltline Electronics', 'Voltline', 'Hearth Home & Furniture', 'Aurum Jewellers', 'Corner Convenience',
    'Roadstar Motors', 'Elm Court Flat 2B', 'Elm Court', 'Lakeview Residences 4A', 'Lakeview', 'Starter Home · 12 Elm St', 'Family Home · 18 Elm St', 'Large House · 24 Elm St',
    'Willowbrook Estate', 'Elm Street', 'Elm St', 'The VanQuest Ledger', 'VanQuest', 'VANQUEST', 'Summit Tower', 'Summit']),
  // fictional assets and tickers
  ...same(['Sagar 50 Index Fund', 'Kaveri Govt Bond Fund', 'Bharat Grid Utilities', 'Lumen Tech', 'Halcyon Pharma', 'CoinNova Token', 'CoinNova', 'GoldenLeaf',
    'SAGAR50', 'KAVERI', 'BHARATGRID', 'LUMEN', 'HALCYON', 'COINNOVA']),
  // vehicles
  ...same(['Chotu Hatch (used, 2016)', 'Chotu Hatch Plus', 'Chotu Hatch', 'Saarthi Sedan', 'Khet Pickup', 'Parivar MPV', 'Regalia Executive']),
  // the local model
  ...same(['qwen3:8b', 'Ollama', 'Qwen']),
  // people
  'Lakshmi Rao': 'లక్ష్మి రావు', 'Mr. Desai': 'దేశాయ్ గారు', 'Vikram': 'విక్రమ్', 'Meera': 'మీరా', 'Arjun': 'అర్జున్', 'Kabir': 'కబీర్',
  // items
  'Basmati rice (5 kg)': 'బాస్మతి బియ్యం (5 కిలోలు)', 'Wheat flour / atta (5 kg)': 'గోధుమ పిండి / ఆటా (5 కిలోలు)', 'Toor dal (1 kg)': 'కంది పప్పు (1 కిలో)',
  'Fresh vegetables (1 kg)': 'తాజా కూరగాయలు (1 కిలో)', 'Onions (1 kg)': 'ఉల్లిపాయలు (1 కిలో)', 'Potatoes (1 kg)': 'బంగాళాదుంపలు (1 కిలో)', 'Seasonal fruit (1 kg)': 'కాలానుగుణ పండ్లు (1 కిలో)',
  'Milk (1 L)': 'పాలు (1 లీటర్)', 'Curd (400 g)': 'పెరుగు (400 గ్రా)', 'Bread loaf': 'బ్రెడ్ ప్యాకెట్', 'Eggs (12)': 'గుడ్లు (12)', 'Cooking oil (1 L)': 'వంట నూనె (1 లీటర్)',
  'Sugar (1 kg)': 'చక్కెర (1 కిలో)', 'Tea leaves (250 g)': 'టీ పొడి (250 గ్రా)', 'Iodised salt (1 kg)': 'అయోడైజ్డ్ ఉప్పు (1 కిలో)', 'Bath soap': 'స్నానపు సబ్బు', 'Toothpaste': 'టూత్‌పేస్ట్',
  'Detergent powder (1 kg)': 'డిటర్జెంట్ పౌడర్ (1 కిలో)', 'Dishwash liquid': 'పాత్రలు కడిగే ద్రవం', 'Notebook': 'నోట్‌బుక్', 'Umbrella': 'గొడుగు', 'Backpack': 'బ్యాక్‌ప్యాక్',
  'Cotton T-shirt': 'కాటన్ టీ-షర్ట్', 'Denim jeans': 'డెనిమ్ జీన్స్', 'Cotton kurta': 'కాటన్ కుర్తా', 'Formal shirt': 'ఫార్మల్ షర్ట్', 'Sneakers': 'స్నీకర్స్',
  'Tailored blazer': 'కుట్టించిన బ్లేజర్', 'Silk saree': 'పట్టు చీర', 'Wired earphones': 'వైర్డ్ ఇయర్‌ఫోన్స్', 'Smartphone': 'స్మార్ట్‌ఫోన్', 'Laptop': 'ల్యాప్‌టాప్',
  'Desktop computer': 'డెస్క్‌టాప్ కంప్యూటర్', '24" monitor': '24" మానిటర్', 'Inkjet printer': 'ఇంక్‌జెట్ ప్రింటర్', 'Wi-Fi router': 'వై-ఫై రౌటర్', 'Smartwatch': 'స్మార్ట్‌వాచ్',
  'Single bed': 'సింగిల్ మంచం', 'Double bed': 'డబుల్ మంచం', 'Study desk': 'చదువుకునే బల్ల', 'Office chair': 'ఆఫీస్ కుర్చీ', 'Dining chair': 'భోజనాల కుర్చీ', 'Two-seat sofa': 'ఇద్దరు కూర్చునే సోఫా',
  'Armchair': 'ఆర్మ్‌చెయిర్', 'Coffee table': 'కాఫీ టేబుల్', 'Dining table': 'భోజనాల బల్ల', 'Wardrobe': 'బట్టల అలమారా', 'Bookshelf': 'పుస్తకాల అర', 'Floor lamp': 'ఫ్లోర్ ల్యాంప్',
  'Potted plant': 'కుండీ మొక్క', 'Woven rug': 'నేసిన తివాచీ', 'Standing mirror': 'నిలువు అద్దం', 'Silver chain': 'వెండి గొలుసు', 'Gold earrings': 'బంగారు చెవిపోగులు', 'Gold ring': 'బంగారు ఉంగరం',
  'Luxury watch': 'విలాసవంతమైన గడియారం', 'Diamond pendant': 'వజ్రాల లాకెట్',
  // jobs and fields of study
  'Part-time retail assistant': 'పార్ట్-టైమ్ రిటైల్ అసిస్టెంట్', 'Junior Software Developer': 'జూనియర్ సాఫ్ట్‌వేర్ డెవలపర్', 'Software Developer': 'సాఫ్ట్‌వేర్ డెవలపర్',
  'Business Analyst': 'బిజినెస్ అనలిస్ట్', 'Senior Business Analyst': 'సీనియర్ బిజినెస్ అనలిస్ట్', 'Financial Analyst': 'ఫైనాన్షియల్ అనలిస్ట్', 'Senior Financial Analyst': 'సీనియర్ ఫైనాన్షియల్ అనలిస్ట్',
  'Graduate Design Engineer': 'గ్రాడ్యుయేట్ డిజైన్ ఇంజనీర్', 'Design Engineer': 'డిజైన్ ఇంజనీర్', 'Staff Nurse': 'స్టాఫ్ నర్స్', 'Senior Staff Nurse': 'సీనియర్ స్టాఫ్ నర్స్',
  'Junior Designer': 'జూనియర్ డిజైనర్', 'Designer': 'డిజైనర్',
  'Computer Science': 'కంప్యూటర్ సైన్స్', 'Business Administration': 'బిజినెస్ అడ్మినిస్ట్రేషన్', 'Mechanical Engineering': 'మెకానికల్ ఇంజనీరింగ్', 'Nursing': 'నర్సింగ్', 'Graphic Design': 'గ్రాఫిక్ డిజైన్',
  'Finance': 'ఫైనాన్స్',
  // achievement names (they appear inside "Achievement unlocked: …")
  'First Stack': 'మొదటి పొదుపు కుప్ప', 'Goal Setter': 'లక్ష్య నిర్దేశకులు', 'Budget Architect': 'బడ్జెట్ రూపశిల్పి', 'Knowledge Seeker': 'జ్ఞాన అన్వేషి',
  'Freshman Spawn': 'కొత్త ప్రయాణం మొదలు', 'First Paycheck': 'మొదటి జీతం', 'Scam Smart': 'మోసాలను గుర్తించే తెలివి', 'Needs Before Wants': 'కోరికల కంటే అవసరాలు ముందు',
  'Consistency Is Key': 'నిలకడే కీలకం', 'The 75% Rule': '75% నియమం', 'Ahead of the Plan': 'ప్రణాళిక కంటే ముందు', 'Debt Slayer': 'అప్పుల సంహారి',
  'Emergency Legend': 'అత్యవసర నిధి వీరులు', 'Compound Curious': 'చక్రవడ్డీపై ఆసక్తి', 'Diversification Station': 'వైవిధ్యీకరణ కేంద్రం', 'First Investment': 'మొదటి పెట్టుబడి',
  'Degree Unlocked': 'డిగ్రీ సాధించారు', 'Scholar of the Realm': 'రాజ్యపు పండితులు', 'Career Climber': 'కెరీర్‌లో ఎదుగుదల', 'Side Quest Entrepreneur': 'పక్క వ్యాపార సాహసి',
  'First Apartment': 'మొదటి అపార్ట్‌మెంట్', 'Home Sweet Home': 'ఇల్లే స్వర్గం', 'Keys to the Kingdom': 'సొంతింటి తాళాలు', 'Four Wheels, One Dream': 'నాలుగు చక్రాలు, ఒక కల',
  'Cash, Not Credit': 'అప్పు కాదు, నగదు', 'Fully Furnished': 'పూర్తిగా అమర్చిన ఇల్లు', 'World Explorer': 'ప్రపంచ యాత్రికులు', 'Independent Mode': 'స్వతంత్ర స్థితి',
  'Retirement Ready': 'పదవీ విరమణకు సిద్ధం', 'Rainy Day Ready': 'కష్టకాలానికి సిద్ధం', 'Plan B': 'ప్లాన్ B', 'Comeback Arc': 'మళ్లీ నిలదొక్కుకోవడం',
  'Changed My Mind': 'మనసు మార్చుకున్నాను', "Lucky Isn't a Strategy": 'అదృష్టం వ్యూహం కాదు', 'YOLO Economy': 'ఇప్పుడే ఖర్చు పెట్టే ధోరణి', 'Broke Before Payday': 'జీతం రాకముందే ఖాళీ జేబు',
  'One More Upgrade': 'ఇంకో అప్‌గ్రేడ్', 'Retirement? Never Heard of It': 'పదవీ విరమణా? ఎప్పుడూ వినలేదు', 'The Short Run': 'స్వల్ప ప్రయాణం', 'The Great Financial Reset': 'మహా ఆర్థిక పునఃప్రారంభం',
  'The Spreadsheet Wizard': 'స్ప్రెడ్‌షీట్ మాంత్రికులు', 'NPC Financial Advisor': 'NPC ఆర్థిక సలహాదారు', 'New Game+': 'కొత్త ఆట+', 'Steady Saver': 'నిలకడైన పొదుపరి',
  'Balanced Life': 'సమతుల్య జీవితం', 'Financially Independent': 'ఆర్థిక స్వాతంత్ర్యం', 'Promise Kept': 'నిలబెట్టుకున్న మాట',
};
