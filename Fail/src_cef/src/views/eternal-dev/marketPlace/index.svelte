<script>
    import { SIDEBAR_CATEGORIES } from "./configs/categories";
    import { executeClient } from "api/rage";

    import { marketItems, acutionLots, marketInventoryItems, marketStorage, favourites } from "store/marketPlace";

    // Pages =================== //
    import Auction from "./pages/Auction/index.svelte";
    import Market from "./pages/Market/index.svelte";
    import Create from "./pages/Create/index.svelte";
    import Storage from "./pages/Storage/index.svelte";
    import Favourites from "./pages/Favourites/index.svelte";
    // ========================= //

    export let viewData;

    $: if (viewData != null && typeof viewData == "string") {
        selectCategory("auction");
    }

    let currentCategory = "auction";

    const pages = {
        Auction,
        Market,
        Create,
        Storage,
        Favourites
    }

    let currentPage;

    $: currentPage = currentCategory == null ? null : currentCategory == "create" ? Create 
        : pages[SIDEBAR_CATEGORIES.find(x => x.type == currentCategory).page]; 

    let items = [];
    $: items = currentCategory == "auction" ? $acutionLots 
        : currentCategory == "item" || currentCategory == "clothes" ? $marketInventoryItems 
        : currentCategory == "create" || currentCategory == "storage" ? $marketStorage 
        : currentCategory == "favourites" ? $favourites 
        : $marketItems;

    const selectCategory = (type) => {
        if (currentCategory == type) 
            return;

        if (type == "exit")
            return executeClient("client.marketPlace.closeApp");

        currentCategory = type;
        executeClient("client.marketPlace.setPage", type);
    }

    window.marketPlace.setPage = (pageName) => {
        selectCategory(pageName)
    };

    import "./style.scss";
</script>

<div class="marketPlace">
    <div class="sidebar">
        <div class="logo">
            <svg id="winwang" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 141.402 42"> <g id="Сгруппировать_3487" data-name="Сгруппировать 3487"> <path id="Контур_12530" data-name="Контур 12530" d="M18.458,10.379,15.424,0H11.349L8.329,10.317,6.394,0H.139L3.659,18.766H9.915v-.013L13.386,6.876l3.476,11.89H23.14L26.661,0H20.406Z" fill="#101010"></path> <path id="Контур_12531" data-name="Контур 12531" d="M56.763,0,54.814,10.379,51.776,0H47.7l-3.02,10.317L42.746,0H36.491l3.521,18.766h6.255v-.013L49.739,6.876l3.476,11.89h6.278L63.018,0Z" fill="#101010"></path> <path id="Контур_12532" data-name="Контур 12532" d="M71.521,0H65.265L61.744,18.766H68l.581-3.128h4.146l.581,3.128h6.255L76.042,0ZM68.965,13.619l1.689-9,1.689,9Z" fill="#101010"></path> <rect id="Прямоугольник_4886" data-name="Прямоугольник 4886" width="6.255" height="18.766" transform="translate(28.448)" fill="#101010"></rect> <path id="Контур_12533" data-name="Контур 12533" d="M94.84,13.1,87.619,0H81.35V18.766h6.255V5.6L94.84,18.717v.049h6.255V0H94.84Z" fill="#101010"></path> <path id="Контур_12534" data-name="Контур 12534" d="M122.095,7.279V6.7A6.7,6.7,0,0,0,115.84,0h-6.255a6.7,6.7,0,0,0-6.255,6.7v5.362a6.7,6.7,0,0,0,6.255,6.7h6.255a6.7,6.7,0,0,0,6.255-6.7V9.383H112.042V11.9h3.8v1.054a3.128,3.128,0,1,1-6.255,0V5.809a3.128,3.128,0,0,1,6.255,0v1.47Z" fill="#101010"></path> </g> <g id="Сгруппировать_3488" data-name="Сгруппировать 3488"> <path id="Контур_12535" data-name="Контур 12535" d="M52.907,36.062l1.707-7.109-3.9,3.418Z" fill="#3d82d5"></path> <path id="Контур_12536" data-name="Контур 12536" d="M44.234,30.763a.961.961,0,0,0-.612-.2h-1.6l-.393,1.609H43.3a1.394,1.394,0,0,0,.858-.241.773.773,0,0,0,.322-.652A.621.621,0,0,0,44.234,30.763Z" fill="#3d82d5"></path> <path id="Контур_12537" data-name="Контур 12537" d="M71.181,30.74a.956.956,0,0,0-.608-.179H68.956l-.389,1.609H70.22a1.367,1.367,0,0,0,.853-.264.8.8,0,0,0,.34-.666A.581.581,0,0,0,71.181,30.74Z" fill="#3d82d5"></path> <path id="Контур_12538" data-name="Контур 12538" d="M34.145,33.587h2.069l-.366-2.8Z" fill="#3d82d5"></path> <path id="Контур_12539" data-name="Контур 12539" d="M141.3,24.177h-.058l-1.166-.322a.545.545,0,0,1-.223-.121c-.353-.317-.706-.639-1.068-.952a1.939,1.939,0,0,0-1.166-.554h-1.126a.255.255,0,0,0-.255.139c-.335.55-.675,1.1-1.019,1.644-.045.067-.071.2-.174.156s-.022-.161,0-.241l2.2-8.57a1.456,1.456,0,0,0,.022-.666q-.55-2.752-1.081-5.514-.237-1.18-.447-2.364c0-.085-.031-.152-.156-.121a1.559,1.559,0,0,0-1.139,1.684c.139.769.295,1.528.447,2.292,0,.085.076.2-.054.237s-.143-.089-.183-.165c-.447-.831-.894-1.662-1.314-2.5-.063-.116-.116-.121-.219-.054a1.564,1.564,0,0,0-.559,1.97c.156.317.326.626.487.934l.416.791a.156.156,0,0,1-.049.219.147.147,0,0,1-.264-.036.743.743,0,0,1-.058-.063c-.447-.518-.934-1.037-1.4-1.559-.076-.085-.125-.1-.179,0s-.165.317-.246.474l-2.989,5.849q-1.626,3.154-3.248,6.322a.237.237,0,0,1-.246.147H3.521L0,42H118.543l3.1-16.532,2.81-.844a.281.281,0,0,1,.232,0,15.146,15.146,0,0,0,2.5.974,16.648,16.648,0,0,0,3.6.643,14.664,14.664,0,0,0,1.827,0,14.526,14.526,0,0,0,1.76-.192,19.659,19.659,0,0,0,3.735-1.028,8.2,8.2,0,0,1,2.681-.634c.174,0,.344-.036.514-.049.054,0,.1,0,.107-.076S141.343,24.195,141.3,24.177ZM43.153,36.339l-.755-2.5H41.231l-.6,2.5H36.518l-.143-1.077h-3.2l-.643,1.077H28.207l1.18-4.915-3.239,4.915h-.925l-.862-4.915-1.18,4.915h-2.1l1.787-7.453H25.7l.706,4.124,2.681-4.124h2.985L30.45,35.713l4.437-6.827h2.645L38.7,35.713l1.64-6.827h3.7a2.913,2.913,0,0,1,1.841.6,1.9,1.9,0,0,1,.773,1.577,2.507,2.507,0,0,1-.634,1.689,2.869,2.869,0,0,1-1.546.943l.974,2.641Zm19.91,0H60.971l1.376-5.777H56.32l-.277,1.162h3.771l-.4,1.676H55.641l-.3,1.264h3.856l-.4,1.676H50.614L49.1,33.466l-.755.693-.541,2.18h-2.1L47.5,28.886h2.1L48.9,31.8l3.079-2.913H67.1l-.4,1.676H64.421Zm7.051-2.5H68.165l-.6,2.5H65.475l1.787-7.453h3.932a2.417,2.417,0,0,1,1.716.6A1.975,1.975,0,0,1,73.58,31a2.529,2.529,0,0,1-.174.894,3.445,3.445,0,0,1-.55.894,2.641,2.641,0,0,1-1.081.724,4.531,4.531,0,0,1-1.662.326Zm13.534,2.5L83.5,35.262H80.3l-.648,1.077h-7.2l1.787-7.453h2.1l-1.39,5.777h3.248l-.031.13L82,28.886H84.63l1.278,7.453Zm16.916-5.777H96.716l-.277,1.162h3.771l-.4,1.676H96.037l-.3,1.264h3.856l-.4,1.676H93.236L93.553,35a3.8,3.8,0,0,1-1.51,1.1,5.192,5.192,0,0,1-1.9.366,4.571,4.571,0,0,1-2.936-.929,2.971,2.971,0,0,1-1.175-2.453,3.927,3.927,0,0,1,1.394-3.128,5.009,5.009,0,0,1,3.4-1.206,4.2,4.2,0,0,1,2.457.652,3.436,3.436,0,0,1,1.251,1.519l.491-2.051h5.951Z" fill="#3d82d5"></path> <path id="Контур_12540" data-name="Контур 12540" d="M91.9,30.781a2.1,2.1,0,0,0-1.175-.322,2.5,2.5,0,0,0-2.52,2.507,1.684,1.684,0,0,0,.567,1.287,2.109,2.109,0,0,0,1.479.523,2.27,2.27,0,0,0,1-.241,1.962,1.962,0,0,0,.791-.621l1.55.938.894-3.776-1.93.576a1.555,1.555,0,0,0-.652-.871Z" fill="#3d82d5"></path> <path id="Контур_12541" data-name="Контур 12541" d="M81.274,33.587h2.069l-.366-2.8Z" fill="#3d82d5"></path> </g> </svg>
        </div>

        {#each SIDEBAR_CATEGORIES as item, index}
            <button on:click={() => selectCategory(item.type)} class={ "button " + item.class } class:selected={item.type == currentCategory}>
                {@html item.icon}
                {item.name}
            </button>
        {/each}
    </div>

    <div class="container">
        <svelte:component items={items} currentCategory={currentCategory} this={currentPage} />
    </div>
</div>