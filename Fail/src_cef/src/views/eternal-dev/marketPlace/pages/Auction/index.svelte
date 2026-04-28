<script>
    import { SORT_TYPES } from "../../configs/sort";

    import { filterItems } from "../../modules/filter";
    import { marketSelectItem } from "../../modules/functions";
    import { calculatedColumnCount } from "../../modules/formats";

    import UserInfo from "../../components/UserInfo/index.svelte";
    import Select from "../../components/Select/index.svelte";
    import AuctionCard from "./AuctionCard/index.svelte";
    import AuctionItem from "./AuctionItem/index.svelte";

    import "./style.scss";

    export let items;

    const SORT_TYPE_OPTIONS = {
        vehicle: {
            label: "Транспорт",
        },
        house: {
            label: "Недвижимость",
        },
        business: {
            label: "Бизнес",
        },
        item: {
            label: "Предметы",
        },
    };

    let filteredItems = [],    
        currentSortType = null,
        currentSort = null,
        columnCount = calculatedColumnCount(),
        selectedLot = null,
        currentItem = null;

    const selectLot = (item) => {
        selectedLot = item ? item.id : item;

        if (item != null) {
            marketSelectItem(item.type, item.id)
        }
        else {
            marketSelectItem("", 0);
        }
    };

    $: currentItem = items.find(x => x.id == selectedLot);
    $: filteredItems = filterItems(filterItems(items, "categories", currentSortType), "sort", currentSort);
</script>

<svelte:window on:resize={(e) => { columnCount = calculatedColumnCount()}} />

{#if currentItem == null}
    <div class="page-data">
        <div class="header">
            <div class="header__content">
                <Select
                    icon="categories"
                    defaultText="Выбор категории"
                    onClick={(type) => {
                        currentSortType = type;
                    }}
                    current={currentSortType}
                    options={SORT_TYPE_OPTIONS}
                />
                <Select
                    icon="sort"
                    defaultText="Сортировать"
                    onClick={(type) => {
                        currentSort = type;
                    }}
                    current={currentSort}
                    options={SORT_TYPES}
                />
            </div>

            <UserInfo />
        </div>

        <div class="content">
            <div class="list" style={'--column-count: ' + columnCount}>
                {#each filteredItems as item, index }
                    <AuctionItem data={item} onClick={selectLot} />
                {/each}
            </div>
        </div>
    </div>
{:else} 
    <AuctionCard backFunction={() => selectLot(null)} data={currentItem} />
{/if}