<script>
    import UserInfo from "../../components/UserInfo/index.svelte";

    // Items =============================== //
    import AuctionItem from "../Auction/AuctionItem/index.svelte";
    import MarketItem from "../Market/MarketItem/index.svelte";
    // ===================================== //
    
    // Cards =============================== //
    import AuctionCard from "../Auction/AuctionCard/index.svelte";
    import MarketCard from "../Market/MarketCard/index.svelte";
    // ===================================== //

    import { marketItems, acutionLots, marketInventoryItems, favourites } from "store/marketPlace";
    import { calculatedColumnCount, getFavouriteData } from "../../modules/formats";

    const formatItem = (lotData, type) => {
        if (lotData == null)
            return lotData;

        return { ...lotData, favourite: type }
    }

    const onClick = (data) => {
        selectedItem = data == null ? null : getFavouriteData(data);
    }

    let columnCount = calculatedColumnCount(),
        selectedItem = null,
        currentItem = null,
        items = [];

    $: items = $favourites.map(favourite => {
        if (favourite.type == "market")
            return formatItem($marketItems.find(x => x.id == favourite.id), "market")

        if (favourite.type == "item" || favourite.type == "clothes")
            return formatItem($marketInventoryItems.find(x => x.params && x.params.itemId == favourite.id), favourite.type)

        if (favourite.type == "auction")
            return formatItem($acutionLots.find(x => x.id == favourite.id), "auction");
    }).filter(x => x != null);

    
    $: currentItem = selectedItem == null ? null : 
        items.find(x => x.favourite == selectedItem.type 
            && (["item", "clothes"].includes(x.type) ? x.params.itemId : x.id) == selectedItem.id 
            && (["item", "clothes"].includes(x.type) ? x.params.itemData == selectedItem.subData : true))
</script>

<svelte:window on:resize={(e) => { columnCount = calculatedColumnCount(); }} />

{#if currentItem != null} 
    {#if currentItem.favourite == "auction"}
        <AuctionCard backFunction={() => onClick(null)} data={currentItem} />
    {:else}
        <MarketCard backFunction={() => onClick(null)} data={currentItem} />
    {/if}
{:else}
    <div class="page-data favourites">
        <div class="header">
            <div class="header__content">
                <div class="header__title">
                    Избранное
                </div>
            </div>

            <UserInfo />
        </div>

        <div class="content">
            <div class="list" style={"--column-count: " + columnCount}>
                {#each items as item, index}
                    {#if item.favourite == "auction"}
                        <AuctionItem onClick={onClick} data={item} />
                    {:else}
                        <MarketItem onClick={() => onClick(item)} data={item} />
                    {/if}
                {/each}
            </div>
        </div>
    </div>
{/if}