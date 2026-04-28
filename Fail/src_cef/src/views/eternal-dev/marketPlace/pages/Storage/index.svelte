<script>
    import UserInfo from "../../components/UserInfo/index.svelte";
    import StorageCard from "./StorageCard/index.svelte";

    import { calculatedColumnCount } from "../../modules/formats";

    let columnCount = calculatedColumnCount();
    
    export let items;
</script>

<svelte:window on:resize={(e) => { columnCount = calculatedColumnCount(); }} />

<div class="page-data storage">
    <div class="header">
        <div class="header__content">
            <div class="header__title">
                Склад хранения
            </div>
        </div>

        <UserInfo />
    </div>

    <div class="content">
        <div class="list" style={"--column-count: " + columnCount}>
            {#each items.filter(x => !x.onEstate) as item, index}
                <StorageCard data={item} type="inStorage" />
            {/each}
        </div>
    </div>
</div>