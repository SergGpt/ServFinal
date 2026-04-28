<!-- Ищем  -->
import TinderIcon from '../assets/images/tinder.png'
<!-- Добавляем после -->
import MarketplaceIcon from '../assets/images/marketplace.svg'

<!-- Ищем -->
{
    name: "Tinder",
    icon: TinderIcon,
    link: "tinder"
},

<!-- Добавляем после -->
{
    name: "Маркетплейс",
    icon: MarketplaceIcon,
    link: "marketPlace"
},

<!-- Ищем -->
if (pageName === "camera") 
<!-- Добавляем перед -->

if (pageName === "marketPlace") {
    executeClientToGroup("close");
    executeClient("client.marketPlace.openApp");
}