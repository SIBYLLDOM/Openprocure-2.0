const axios = require('axios');
const cheerio = require('cheerio');

async function fetchGeMCatalogue(url) {
  try {
    console.log(`\n🔍 Fetching: ${url}\n`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Extract title
    const title = $('.phead').text().trim() || 'N/A';

    // Extract specs from table
    const specs = [];
    let currentCategory = '';

    $('table tbody tr').each((i, row) => {
      const cells = $(row).find('td');

      if (cells.length === 3) {
        // Row with category + spec + value
        currentCategory = $(cells[0]).text().trim();
        specs.push({
          category: currentCategory,
          specification: $(cells[1]).text().trim(),
          allowedValues: $(cells[2]).text().trim(),
        });
      } else if (cells.length === 2) {
        // Row with only spec + value (category carried forward)
        specs.push({
          category: currentCategory,
          specification: $(cells[0]).text().trim(),
          allowedValues: $(cells[1]).text().trim(),
        });
      }
    });

    return { title, specs };

  } catch (err) {
    if (err.response) {
      console.error(`❌ HTTP Error: ${err.response.status} - ${err.response.statusText}`);
    } else {
      console.error(`❌ Error: ${err.message}`);
    }
    return null;
  }
}

function printResult(result) {
  if (!result) {
    console.log('Failed to fetch catalogue.');
    return;
  }

  console.log(`📋 Catalogue: ${result.title}`);
  console.log(`📦 Total Specs Found: ${result.specs.length}\n`);

  const col1 = 25;
  const col2 = 50;

  console.log(
    'Category'.padEnd(col1) + ' | ' +
    'Specification'.padEnd(col2) + ' | ' +
    'Allowed Values'
  );
  console.log('-'.repeat(120));

  result.specs.forEach(({ category, specification, allowedValues }) => {
    console.log(
      category.padEnd(col1) + ' | ' +
      specification.padEnd(col2) + ' | ' +
      allowedValues
    );
  });

  console.log('-'.repeat(120));
  console.log('\n✅ Done!\n');
}

// ✅ Pass any GeM catalogue URL here
const url = process.argv[2] || 'https://bidplus.gem.gov.in/bidding/bid/showCatalogue/4oSDym2j3ZfCQleMmmk-DrLVrRuV8awR8yiShiI8fRg';

fetchGeMCatalogue(url).then(printResult);